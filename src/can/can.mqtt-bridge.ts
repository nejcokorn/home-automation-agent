import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { MqttService } from "../mqtt/mqtt.service";
import { CanService } from "./can.service";

@Injectable()
export class CanMqttBridge implements OnModuleInit {
	private readonly logger = new Logger(CanMqttBridge.name);
	constructor(
		private readonly mqtt: MqttService,
		private readonly can: CanService,
	) {}

	onModuleInit() {
		// primer: can/<iface>/tx
		this.mqtt.subscribe("can/+/tx", (topic, payload) => {
			const [, iface] = topic.split("/"); // "can","<iface>","tx"
			try {
				this.can.sendFrame({ iface, ...payload });
			} catch (e) {
				this.logger.error(
					`TX via MQTT failed (${topic}): ${(e as Error).message}`,
				);
			}
		});
	}
}
