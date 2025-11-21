import { Injectable, OnModuleInit, OnModuleDestroy } from "@nestjs/common";
import { Can, Interface, CanFrame } from "./can.types";
import * as fs from "fs";
import * as socketcan from "socketcan"
import { LoggerExtra } from "src/extras/logger.extra";

type Unsubscribe = () => void;

@Injectable()
export class CanService implements OnModuleInit, OnModuleDestroy {
	private readonly logger = new LoggerExtra(CanService.name);
	private canMap = new Map<string, Can>();
	private ifaceStatusCheckInterval?: NodeJS.Timeout;
	private patterns: string[] = [];

	private listeners = new Set<(can: Can, frame: CanFrame) => void>();

	async onModuleInit() {
		let query = "can*";
		this.patterns = query.split(",").map((s) => s.trim()).filter(Boolean);
		this.logger.log(`Auto-CAN patterns: ${this.patterns.join(", ")}`);

		// Establish all can interfaces
		await this.ifaceStatusCheck();

		// Periodicly maintain all can0..n
		this.ifaceStatusCheckInterval = setInterval(() => {
			this.ifaceStatusCheck().catch((error) =>
				this.logger.error(`ifaceStatusCheck error: ${(error as Error).message}`),
			);
		}, 2000);
	}

	async onModuleDestroy() {
		if (this.ifaceStatusCheckInterval) clearInterval(this.ifaceStatusCheckInterval);
		await Promise.all(
			[...this.canMap.keys()].map((i) => this.closeChannel(i)),
		);
	}
	
	listInterfaces(): Interface[] {
		return [...this.canMap.values()].map((can) => can.iface);
	}

	subscribe(fn: (can: Can, frame: CanFrame) => void): Unsubscribe {
		this.listeners.add(fn);
		return () => this.listeners.delete(fn);
	}

	send(iface: string, frame: CanFrame) {
		// Get can based on the iface
		const can = this.canMap.get(iface);
		if (!can) {
			throw new Error(`Interface ${iface} not open`);
		}
		const data = frame.data ? frame.data : Buffer.alloc(0);
		
		can.channel.send({
			id: frame.id,
			data,
			ext: !!frame.ext,
			rtr: !!frame.rtr,
		});
		can.iface.txCount++;
		// this.logger.verbose(`[${input.iface}] TX id=0x${frame.id.toString(16)} len=${frame.data.length} ${frame.data.toString("hex")}`,);
	}

	private resolvePatterns(patterns: string[]): string[] {
		// Get list of interfaces in /sys/class/net
		const ifaceDir = "/sys/class/net";
		let names: string[] = [];
		try {
			names = fs
				.readdirSync(ifaceDir, { withFileTypes: true })
				.filter((d) => d.isSymbolicLink() || d.isDirectory())
				.map((d) => d.name);
		} catch (error) {
			this.logger.error(`resolvePatterns error: ${(error as Error).message}`);
		}

		// TODO what are we filtering here
		const toRegex = (pat: string) =>
			new RegExp(
				"^" +
					pat
						.split("*")
						.map((p) => p.replace(/[.+^${}()|[\]\\]/g, "\\$&"))
						.join(".*")
						.replace(/\?/g, ".") +
					"$",
			);
		const regs = patterns.map(toRegex);
		return names.filter((n) => regs.some((r) => r.test(n)));
	}

	private isOperUp(iface: string): boolean {
		try {
			const s = require("fs")
				.readFileSync(`/sys/class/net/${iface}/operstate`, "utf8")
				.trim();
			return s === "up";
		} catch {
			return false;
		}
	}

	private async closeChannel(iface: string) {
		const can = this.canMap.get(iface);
		if (!can) return;
		this.logger.log(`Closing ${iface}...`);
		try {
			can.channel?.stop?.();
		} catch {}
		this.canMap.delete(iface);
	}

	private openChannel(iface: string) {
		let can: Can = {
			channel: null as any,
			iface: {
				name:iface,
				rxCount: 0,
				txCount: 0,
			}
		};
		this.canMap.set(iface, can);
		this.logger.log(`Opening ${iface}...`);
		try {
			const channel = socketcan.createRawChannel(iface, true);
			can.channel = channel;

			channel.addListener("onMessage", (frame: CanFrame) => {
				try {
					can.iface.rxCount++;
					for (const listener of this.listeners) {
						listener(can, frame);
					}
				} catch (error) {
					this.logger.error(`[${iface}] RX handler error: ${(error as Error).message}`,);
				}
			});

			channel.start();
			this.logger.log(`${iface} started`);
		} catch (error) {
			this.logger.error(`Error opening channel ${iface} error: ${(error as Error).message}`);
		}
	}

	private async reopenChannel(iface: string) {
		try {
			await this.closeChannel(iface);
		} catch (error) {
			this.logger.error(`resolvePatterns error: ${(error as Error).message}`);
		}
		this.openChannel(iface);
	}

	// Check interface status check
	private async ifaceStatusCheck() {
		const interfaces = this.resolvePatterns(this.patterns);

		// Open missing interfaces
		for (const iface of interfaces) {
			if (!this.canMap.has(iface)) this.openChannel(iface);
		}

		// Check healthy interfaces
		for (const [iface, can] of this.canMap.entries()) {
			if (!interfaces.includes(iface)) continue;

			const operUp = this.isOperUp(iface);

			// TODO Send test package on channel

			// Check interface status
			if (!operUp) {
				this.logger.warn(`[${iface}] unhealthy (upp=${operUp}) → reopen`,);
				await this.reopenChannel(iface);
			}
		}

		// Close dead channels
		for (const iface of [...this.canMap.keys()]) {
			if (!interfaces.includes(iface)) await this.closeChannel(iface);
		}
	}

}
