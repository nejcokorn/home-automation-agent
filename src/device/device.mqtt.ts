import { MqttService } from "src/mqtt/mqtt.service";
import { DeviceService } from "./device.service";
import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { CanService } from "src/can/can.service";
import { Can, CanFrame } from "src/can/can.types";
import { DeviceFrame } from "./device.types";

type Unsubscribe = () => void;

@Injectable()
export class DeviceMqtt implements OnModuleInit, OnModuleDestroy {
	private canSubscription: Unsubscribe = () => {};

	constructor(
		private readonly mqtt: MqttService,
		private readonly can: CanService,
		private readonly deviceService: DeviceService,
	) {}

	async onModuleInit() {
		this.mqtt.subscribe

		// Monitor CAN massages
		this.pipeBroadcastMessages();
	}

	onModuleDestroy() {
		// unsubscribe from can events
		this.canSubscription();
	}

	private async pipeBroadcastMessages() {
		this.canSubscription = this.can.subscribe((can: Can, frame: CanFrame) => {
			let payload: DeviceFrame = this.deviceService.parseFrame(frame);
			
			if (payload.to == this.deviceService.canAddresses.broadcast) {
				if (payload.dataCtrl.isInput) { // Pipe input changes to MQTT
					this.mqtt.publish(`can/${can.iface.name}/device/${payload.from}/input/${payload.port}`, payload); 
				} else if (payload.dataCtrl.isOutput) { // Pipe output changes to MQTT
					this.mqtt.publish(`can/${can.iface.name}/device/${payload.from}/output/${payload.port}`, payload);
				}
			}
		});
	}
}