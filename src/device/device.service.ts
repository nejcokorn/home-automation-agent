import { Injectable, OnModuleInit, OnModuleDestroy } from "@nestjs/common";
import { CanFrame } from "src/can/can.types";
import { CommControl, DataControl, ConfigType, DataType, DeviceFrame } from "src/device/device.types";
import { LoggerExtra } from "src/extras/logger.extra";
import { ExtraPromise } from "src/extras/promise.extra";
import { CanService } from "src/can/can.service";
import { DeviceConfigDto } from "./device.dto";

type Unsubscribe = () => void;

@Injectable()
export class DeviceService implements OnModuleInit, OnModuleDestroy {
	private readonly logger = new LoggerExtra(DeviceService.name);

	private canAddresses = {
		readPort: 0xF0,
		write: 0xF1,
		discover: 0xF2,
		ping: 0xF3,
		readConfig: 0xF4,
		writeConfig: 0xF5,
		writeEEPROM: 0xF6,
		broadcast: 0x7FF,
	}

	constructor(
		private readonly can: CanService
	) {}

	async onModuleInit() {

	}

	async onModuleDestroy() {
		
	}

	public async readPort(iface: string, deviceId: number, signalType: string, direction: string, portId: number) {
		let unsubscribe: Unsubscribe = () => {};
		
		return await new ExtraPromise((resolve, reject) => {
			let buf : Buffer = Buffer.alloc(8);
			let commControl : number = CommControl.Command;
			let dataCtrl : number = (signalType == "analog" ? DataControl.Analog : DataControl.Empty) | (direction == "input" ? DataControl.Input : DataControl.Empty)
			buf[0] = this.canAddresses.readPort;
			buf[1] = commControl;
			buf[2] = dataCtrl;
			buf[3] = portId;

			unsubscribe = this.can.subscribe((frame: CanFrame) => {
				let payload = this.parseFrame(frame);
				if (payload.to == this.canAddresses.readPort
					&& payload.commControl.isCommand == true
					&& payload.commControl.isAcknowledge == true
					&& payload.dataCtrl.isWrite == false
					&& payload.port == portId
				) {
					resolve(payload.data);
				}
			});
			
			this.can.send(iface, {
				id: deviceId,
				data: buf
			});
		})
		.timeout(1000)
		.finally(() => {
			unsubscribe();
		});
	}

	public async writePort(iface: string, deviceId: number, signalType: string, direction: string, portId: number, data: number) {
		let unsubscribe: Unsubscribe = () => {};
		
		return await new ExtraPromise((resolve, reject) => {
			let buf : Buffer = Buffer.alloc(8);
			let commControl : number = CommControl.Command;
			let dataCtrl : number = DataControl.Write | (signalType == "analog" ? DataControl.Analog : DataControl.Empty) | (direction == "input" ? DataControl.Input : DataControl.Empty)
			buf[0] = this.canAddresses.readPort;
			buf[1] = commControl;
			buf[2] = dataCtrl;
			buf[3] = portId;
			Buffer.from([data >> 24, data >> 16, data >> 8, data]).copy(buf, 4);

			unsubscribe = this.can.subscribe((frame: CanFrame) => {
				let payload = this.parseFrame(frame);
				if (payload.to == this.canAddresses.readPort
					&& payload.commControl.isCommand == true
					&& payload.commControl.isAcknowledge == true
					&& payload.dataCtrl.isWrite == true
					&& payload.port == portId
				) {
					resolve(payload.data);
				}
			});
			
			this.can.send(iface, {
				id: deviceId,
				data: buf
			});
		})
		.timeout(1000)
		.finally(() => {
			unsubscribe();
		});
	}
	
	public async ping(iface: string, deviceId: number) {
		let unsubscribe: Unsubscribe = () => {};
		
		return await new ExtraPromise((resolve, reject) => {
			let deviceList: number[] = [];
			let buf : Buffer = Buffer.alloc(8);
			let commControl : number = CommControl.Command | CommControl.Ping;
			let dataCtrl : number = DataControl.Empty;
			buf[0] = this.canAddresses.ping;
			buf[1] = commControl;
			buf[2] = dataCtrl;

			let timeout = setTimeout(() => {
				resolve(deviceList);
			}, 100)
			unsubscribe = this.can.subscribe((frame: CanFrame) => {
				let payload = this.parseFrame(frame);
				if (payload.to == this.canAddresses.ping
					&& payload.commControl.isCommand == true
					&& payload.commControl.isPing == true
					&& payload.commControl.isAcknowledge == true
				) {
					if (deviceId != this.canAddresses.broadcast) {
						deviceList.push(payload.from);
					} else {
						resolve([payload.from]);
						timeout.close();
					}
				}
			});

			this.can.send(iface, {
				id: deviceId,
				data: buf
			});
		})
		.timeout(1000)
		.finally(() => {
			unsubscribe();
		});
	}

	public async discover(iface: string) {
		let unsubscribe: Unsubscribe = () => {};
		
		return await new ExtraPromise((resolve, reject) => {
			let deviceList: number[] = [];
			let buf : Buffer = Buffer.alloc(8);
			let commControl : number = CommControl.Command | CommControl.Discovery;
			let dataCtrl : number = DataControl.Empty;
			buf[0] = this.canAddresses.discover;
			buf[1] = commControl;
			buf[2] = dataCtrl;

			let timeout = setTimeout(() => {
				resolve(deviceList);
			}, 100);
			unsubscribe = this.can.subscribe((frame: CanFrame) => {
				let payload = this.parseFrame(frame);
				if (payload.to == this.canAddresses.discover
					&& payload.commControl.isDiscovery == true
					&& payload.commControl.isAcknowledge == true
				) {
					deviceList.push(payload.from);
				}
			});

			this.can.send(iface, {
				id: this.canAddresses.broadcast,
				data: buf
			});
		})
		.timeout(1000)
		.finally(() => {
			unsubscribe();
		});
	}

	public async setConfig(iface: string, deviceId: number, config: DeviceConfigDto[]) {
		for (let idxPort = 0; idxPort < config.length; idxPort++) {
			let inputConfig = config[idxPort];
			for (const configType in inputConfig) {
				let unsubscribe: Unsubscribe = () => {};
				await new ExtraPromise((resolve, reject) => {
					let configData;
					if (["ActionToggle", "ActionHigh", "ActionLow"].includes(configType)) {
						// Array of number
						configData = this.portsToHex(inputConfig[configType]);
					} else {
						// Data is just a number
						configData = inputConfig[configType];
					}

					// Construct config for each input port
					let commControl : number = CommControl.Command;
					let dataCtrl : number = DataControl.Config | DataControl.Input | DataControl.Write;
					let buf : Buffer = Buffer.alloc(8);
					buf[0] = this.canAddresses.writeConfig;
					buf[1] = commControl;
					buf[2] = dataCtrl;
					buf[3] = idxPort + 1;
					buf[4] = ConfigType[configType];
					Buffer.from([configData >> 16, configData >> 8, configData]).copy(buf, 5);

					// Set listener for ACK
					unsubscribe = this.can.subscribe((frame: CanFrame) => {
						let payload = this.parseFrame(frame);
						if (payload.to == this.canAddresses.writeConfig
							&& payload.from == deviceId
							&& payload.commControl.isCommand == true
							&& payload.commControl.isAcknowledge == true
							&& payload.dataCtrl.isConfig == true
							&& payload.dataCtrl.isInput == true
							&& payload.dataCtrl.isWrite == true
							&& payload.configCtrl == ConfigType[configType]
						) {
							resolve(payload);
						}
					});
					// Sent config data
					this.can.send(iface, {
						id: deviceId,
						data: buf
					});
				})
				.timeout(1000)
				.catch((error) => {
					return error;
				})
				.finally(() => {
					unsubscribe();
				});
			}
		}
	}

	public async getConfig(iface: string, deviceId: number) {
		// Extract Keys and values from ConfigType
		const configNames = Object.keys(ConfigType).filter(k => isNaN(Number(k)));
		const configValues = Object.values(ConfigType).filter(v => typeof v === "number") as number[];

		let deviceConfig: any = [];
		
		for (let idxPort = 0; idxPort < 16; idxPort++) {
			let inputConfig = {};
			for (let configIdx = 0; configIdx < configNames.length; configIdx++){
				if (configNames[configIdx] == "Reset") {
					continue;
				}
				let unsubscribe: Unsubscribe = () => {};
				let configValue = await new ExtraPromise<number>((resolve, reject) => {
					// Construct config for each input port
					let commControl : number = CommControl.Command;
					let dataCtrl : number = DataControl.Config | DataControl.Input; // !DataControl.Write
					let buf : Buffer = Buffer.alloc(8);
					buf[0] = this.canAddresses.readConfig;
					buf[1] = commControl;
					buf[2] = dataCtrl;
					buf[3] = idxPort + 1;
					buf[4] = Number(configValues[configIdx]);

					unsubscribe = this.can.subscribe((frame: CanFrame) => {
						let payload = this.parseFrame(frame);
						if (payload.to == this.canAddresses.readConfig
							&& payload.commControl.isCommand == true
							&& payload.commControl.isAcknowledge == true
							&& payload.dataCtrl.isConfig == true
							&& payload.dataCtrl.isInput
							&& payload.configCtrl == Number(configValues[configIdx])
						) {
							resolve(payload.data);
						}
					});

					this.can.send(iface, {
						id: deviceId,
						data: buf
					});
				})
				.timeout(1000)
				.finally(() => {
					unsubscribe();
				});
				if (["ActionToggle", "ActionHigh", "ActionLow"].includes(configNames[configIdx])) {
					// Transform hex into array of numbers
					inputConfig[configNames[configIdx]] = this.hexToPorts(configValue);
				} else {
					inputConfig[configNames[configIdx]] = configValue;
				}
			}
			deviceConfig.push(inputConfig);
		}
		return deviceConfig;
	}

	public async writeEEPROM(iface: string, deviceId: number) {
		let unsubscribe: Unsubscribe = () => {};
		
		return await new ExtraPromise((resolve, reject) => {
			let buf : Buffer = Buffer.alloc(8);
			let commControl : number = CommControl.Command;
			let dataCtrl : number = DataControl.Config | DataControl.WriteEEPROM;
			buf[0] = this.canAddresses.writeEEPROM;
			buf[1] = commControl;
			buf[2] = dataCtrl;

			unsubscribe = this.can.subscribe((frame: CanFrame) => {
				let payload = this.parseFrame(frame);
				if (payload.to == this.canAddresses.writeEEPROM
					&& payload.commControl.isCommand == true
					&& payload.commControl.isAcknowledge == true
					&& payload.dataCtrl.isWriteEEPROM == true
				) {
					resolve(true);
				}
			});
			
			this.can.send(iface, {
				id: deviceId,
				data: buf
			});
		})
		.timeout(10000) // Writing to EEPROM can take longer
		.finally(() => {
			unsubscribe();
		});
	}

	private parseFrame(frame: CanFrame): DeviceFrame {
		let configCtrl : any = null;
		let data : any = null;

		let to = frame.id;
		let from = frame.data[0];
		let commControl = {
			isCommand: frame.data[1] & CommControl.Command ? true : false,
			isDiscovery: frame.data[1] & CommControl.Discovery ? true : false,
			isPing: frame.data[1] & CommControl.Ping ? true : false,
			isAcknowledge: frame.data[1] & CommControl.ACK ? true : false,
			isError: frame.data[1] & CommControl.Error ? true : false
		};
		let dataCtrl = {
			isConfig : frame.data[2] & DataControl.Config ? true : false,
			isWriteEEPROM : frame.data[2] & DataControl.WriteEEPROM ? true : false,
			isWrite : frame.data[2] & DataControl.Write ? true : false,
			isAnalog : frame.data[2] & DataControl.Analog ? true : false,
			isInput : frame.data[2] & DataControl.Input ? true : false,
			dataType : (frame.data[2] & DataControl.DataType) >> 1,
		};
		let port = frame.data[3];
		if (dataCtrl.isConfig) {
			configCtrl = frame.data[4];
			data =
				(frame.data[5] << 16) |
				(frame.data[6] << 8) |
				frame.data[7];
		} else {
			data =
				(frame.data[4] << 24) |
				(frame.data[5] << 16) |
				(frame.data[6] << 8) |
				frame.data[7];
		}
		return {
			to,
			from,
			commControl,
			dataCtrl,
			configCtrl,
			port,
			data
		}
	}

	private hexToPorts(hex: number, numPorts: number = 16): number[] {
		// Transform hex into array of ports
		let ports: number[] = [];
		for (let i = 0; i < numPorts; i++) {
			if (((hex >> i) & 0x01) == 1) {
				ports.push(i+1);
			}
		}

		// Return array of ports
		return ports;
	}

	private portsToHex(ports: number[]): number {
		let hex = 0x0;
		for (let port of ports) {
			hex = hex | (1 << (port -1));
		}
		return hex;
	}
}