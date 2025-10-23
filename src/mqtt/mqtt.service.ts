import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from "@nestjs/common";
import { connect, MqttClient, IClientOptions } from "mqtt";
import { DeviceService } from "src/device/device.service";

@Injectable()
export class MqttService implements OnModuleInit, OnModuleDestroy {
	private readonly logger = new Logger(MqttService.name);
	private client!: MqttClient;

	constructor(
		private readonly device: DeviceService
	) {}

	onModuleInit() {
		const url = "mqtt://localhost:1883";
		const opts: IClientOptions = {
			clientId: `can-agent-${Math.random().toString(16).slice(2)}`,
			username: process.env.MQTT_USERNAME || undefined,
			password: process.env.MQTT_PASSWORD || undefined,
			reconnectPeriod: 5000,
			clean: true,
			will: {
				topic: "agent/status",
				payload: Buffer.from("offline"),
				retain: true,
				qos: 0,
			},
		};
		this.client = connect(url, opts);
		this.client.on("connect", () => {
			this.logger.log(`MQTT connected to ${url}`); 
			this.client.publish("agent/status", "online", { retain: true });
			this.client.subscribe("agent/status");
		});
		this.client.on("reconnect", () =>
			this.logger.warn("MQTT reconnecting…"),
		);
		this.client.on("error", (e) =>
			this.logger.error(`MQTT error: ${e.message}`),
		);

		// Set subscriptions
		this.subscribe('can/device/+/', this.discover);
	}

	onModuleDestroy() {
		return new Promise<void>((resolve) => {
			this.client?.end(true, {}, () => resolve());
		});
	}

	publish(topic: string, payload: unknown, retain = false, qos?: 0 | 1 | 2) {
		const msg = Buffer.from(JSON.stringify(payload));
		this.client.publish(topic, msg, {
			retain,
			qos: (qos ?? Number(process.env.MQTT_QOS ?? 0)) as 0 | 1 | 2,
		});
	}

	subscribe(topic: string, handler: (topic: string, payload: any) => void) {
		if (this.client) {
			this.client.subscribe(
				topic,
				{ qos: Number(process.env.MQTT_QOS ?? 0) as 0 | 1 | 2 },
				(err) => {
					if (err)
						this.logger.error(
							`Subscribe error for ${topic}: ${err.message}`,
						);
				},
			);
			this.client.on("message", (t, p) => {
				if (!this.topicMatch(t, topic)) return;
				try {
					handler(t, JSON.parse(p.toString("utf8")));
				} catch (e) {
					this.logger.error(`Bad JSON on ${t}: ${(e as Error).message}`);
				}
			});
		}
	}

	// preprost matcher za +/# (zadostuje za naš primer)
	private topicMatch(actual: string, sub: string) {
		if (sub === actual) return true;
		const subParts = sub.split("/");
		const actParts = actual.split("/");
		for (let i = 0; i < subParts.length; i++) {
			const s = subParts[i],
				a = actParts[i];
			if (s === "#") return true;
			if (s !== "+" && s !== a) return false;
		}
		return subParts.length === actParts.length;
	}

	// can/
	private async discover(topic: string, payload: any){
		// let devices = await this.device.discover(topic.split('/')[1]);
		
	}
}
