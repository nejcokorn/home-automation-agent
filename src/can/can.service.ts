// src/can/can.service.ts
import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from "@nestjs/common";
import { CanInterface, RxFrame, TxFrameInput } from "./can.types";
import * as fs from "fs";
import * as socketcan from "socketcan"

// (opcijsko) MQTT
import { MqttService } from "../mqtt/mqtt.service";

type Can = {
	channel: any;
	interface: CanInterface;
};

@Injectable()
export class CanService implements OnModuleInit, OnModuleDestroy {
	private readonly logger = new Logger(CanService.name);
	private canMap = new Map<string, Can>();
	private ifaceStatusCheckInterval?: NodeJS.Timeout;
	private patterns: string[] = [];

	constructor(private readonly mqtt?: MqttService) {}

	async onModuleInit() {
		let query = "can*";
		this.patterns = query.split(",").map((s) => s.trim()).filter(Boolean);
		this.logger.log(`Auto-CAN patterns: ${this.patterns.join(", ")}`);

		// Establish all can interfaces
		await this.ifaceStatusCheck();

		// Periodicly maintain all can0..n
		this.ifaceStatusCheckInterval = setInterval(() => {
			this.ifaceStatusCheck().catch((e) =>
				this.logger.error(`ifaceStatusCheck error: ${e.message}`),
			);
		}, 10000);
	}

	async onModuleDestroy() {
		if (this.ifaceStatusCheckInterval) clearInterval(this.ifaceStatusCheckInterval);
		await Promise.all(
			[...this.canMap.keys()].map((i) => this.closeInterface(i)),
		);
	}

	list(): CanInterface[] {
		return [...this.canMap.values()].map((r) => r.interface);
	}

	sendFrame(input: TxFrameInput) {
		const can = this.canMap.get(input.iface);
		if (!can)
			throw new Error(`Interface ${input.iface} not open`);
		const data = Array.isArray(input.data)
			? Buffer.from(input.data)
			: Buffer.alloc(0);
		const frame = {
			id: input.id,
			data,
			ext: !!input.ext,
			rtr: !!input.rtr,
		};
		can.channel.send(frame);
		can.interface.txCount++;
		this.logger.debug(
			`[${input.iface}] TX id=0x${frame.id.toString(16)} len=${frame.data.length} ${frame.data.toString("hex")}`,
		);
		this.publishState(input.iface);
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
				await this.reopenInterface(iface);
			}
		}

		// Close dead channels
		for (const iface of [...this.canMap.keys()]) {
			if (!interfaces.includes(iface)) await this.closeInterface(iface);
		}
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
		} catch {
			// skip
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

	private async reopenInterface(iface: string) {
		try {
			await this.closeInterface(iface);
		} catch {}
		this.openChannel(iface);
	}

	private openChannel(iface: string) {
		let can: Can = {
			channel: null as any,
			interface: {
				iface,
				rxCount: 0,
				txCount: 0,
			}
		};
		this.canMap.set(iface, can);
		this.logger.log(`Opening ${iface}...`);
		try {
			const channel = socketcan.createRawChannel(iface, true);
			can.channel = channel;

			channel.addListener("onMessage", (msg: RxFrame) => {
				try {
					can.interface.rxCount++;
					this.handleRx(iface, msg);
				} catch (e) {
					this.logger.error(
						`[${iface}] RX handler error: ${(e as Error).message}`,
					);
				}
				this.publishState(iface);
			});

			channel.start();
			this.logger.log(`${iface} started`);
			this.publishState(iface);
		} catch {
			this.logger.log(`Error opening channel ${iface}...`);
		}
	}

	private async closeInterface(iface: string) {
		const can = this.canMap.get(iface);
		if (!can) return;
		this.logger.log(`Closing ${iface}...`);
		try {
			can.channel?.stop?.();
		} catch {}
		this.canMap.delete(iface);
		// Push new state to mqtt
		this.publishState(iface);
	}

	private handleRx(iface: string, msg: RxFrame) {
		this.logger.verbose(
			`[${iface}] RX id=0x${msg.id.toString(16)} len=${msg.data?.length ?? 0} ${msg.data?.toString("hex") ?? ""}`,
		);
		// MQTT publish (če na voljo)
		this.mqtt?.publish(`can/${iface}/rx`, {
			id: msg.id,
			ext: !!msg.ext,
			rtr: !!msg.rtr,
			dataHex: msg.data?.toString("hex") ?? "",
			ts: new Date().toISOString(),
		});
	}

	private publishState(iface: string) {
		const can = this.canMap.get(iface);
		if (!can || !this.mqtt) return;
		this.mqtt.publish(`can/${iface}/state`, can.interface, true); // retained
	}
}
