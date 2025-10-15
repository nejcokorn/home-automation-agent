import {
	Injectable,
	Logger,
	OnModuleInit,
	OnModuleDestroy,
} from "@nestjs/common";
import { connect, MqttClient, IClientOptions } from "mqtt";

@Injectable()
export class MqttService implements OnModuleInit, OnModuleDestroy {
	private readonly logger = new Logger(MqttService.name);
	private client!: MqttClient;

	onModuleInit() {
		const url = process.env.MQTT_URL ?? "mqtt://localhost:1883";
		const opts: IClientOptions = {
			clientId:
				process.env.MQTT_CLIENT_ID ??
				`can-bridge-${Math.random().toString(16).slice(2)}`,
			username: process.env.MQTT_USERNAME || undefined,
			password: process.env.MQTT_PASSWORD || undefined,
			reconnectPeriod: 10000,
			clean: false, // ohrani naročnine
			will: {
				topic: "can/bridge/lwt",
				payload: Buffer.from("offline"),
				retain: true,
				qos: 0,
			},
		};
		this.client = connect(url, opts);
		this.client.on("connect", () => {
			this.logger.log(`MQTT connected to ${url}`);
			this.client.publish("can/bridge/lwt", "online", { retain: true });
		});
		this.client.on("reconnect", () =>
			this.logger.warn("MQTT reconnecting…"),
		);
		this.client.on("error", (e) =>
			this.logger.error(`MQTT error: ${e.message}`),
		);
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
}
