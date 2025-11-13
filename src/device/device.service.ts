import { Injectable, OnModuleInit, OnModuleDestroy } from "@nestjs/common";
import { CanFrame } from "src/can/can.types";
import { CommControl, DataControl, ConfigType, DataType, DeviceFrame, OperationType, ActionType } from "src/device/device.types";
import { LoggerExtra } from "src/extras/logger.extra";
import { ExtraPromise } from "src/extras/promise.extra";
import { CanService } from "src/can/can.service";
import { DeviceConfigDto, ActionDto } from "./device.dto";

type Unsubscribe = () => void;

@Injectable()
export class DeviceService implements OnModuleInit, OnModuleDestroy {
	private readonly logger = new LoggerExtra(DeviceService.name);

	private unsubscribeEvents: Unsubscribe = () => {};
	private listeners = new Set<(event: DeviceFrame) => void>();
	private timeout = {
		command: 10,
		config: 2500,
		configSingle: 25,
		grace: 70,
		ping: 100,
		discover: 100,
		EEPROM: 60000 // Long operation - timeout after 1 min (usually between 30 sec and 1 min)
	}

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
		this.unsubscribeEvents = this.can.subscribe((frame: CanFrame) => {
			let payload = this.parseFrame(frame);
			// Catch all boradcast packages
			if (payload.to == this.canAddresses.broadcast) {
				// Distrubute this package to listeners
				for (const listener of this.listeners) {
					listener(payload);
				}
			}
		});
	}

	async onModuleDestroy() {
		this.unsubscribeEvents();
	}

	subscribe(fn: (event: DeviceFrame) => void): Unsubscribe {
		this.listeners.add(fn);
		return () => this.listeners.delete(fn);
	}

	public async readPort(optinos: { iface: string, deviceId: number, signalType: string, direction: string, portId: number }) {
		let unsubscribe: Unsubscribe = () => {};
		
		return await new ExtraPromise((resolve, reject) => {
			let buf : Buffer = Buffer.alloc(8);
			let commControl : number = CommControl.Command;
			let dataCtrl : number = (optinos.signalType == "analog" ? DataControl.Analog : DataControl.Empty) | (optinos.direction == "input" ? DataControl.Input : DataControl.Empty)
			buf[0] = this.canAddresses.readPort;
			buf[1] = commControl;
			buf[2] = dataCtrl;
			buf[3] = optinos.portId;

			unsubscribe = this.can.subscribe((frame: CanFrame) => {
				let payload = this.parseFrame(frame);
				if (payload.to == this.canAddresses.readPort
					&& payload.commControl.isCommand == true
					&& payload.commControl.isAcknowledge == true
					&& payload.dataCtrl.isWrite == false
					&& payload.port == optinos.portId
				) {
					resolve(payload.data);
				}
			});
			
			this.can.send(optinos.iface, {
				id: optinos.deviceId,
				data: buf
			});
		})
		.timeout(this.timeout.command)
		.finally(() => {
			unsubscribe();
		});
	}

	public async writePort(options: { iface: string, deviceId: number, signalType: string, direction: string, portId: number, toggle: Boolean, state: number, delayLow: number }) {
		let unsubscribe: Unsubscribe = () => {};
		
		return await new ExtraPromise((resolve, reject) => {
			let data = options.delayLow ? options.delayLow : options.state;
			let buf : Buffer = Buffer.alloc(8);
			let commControl : number = CommControl.Command;
			let dataCtrl : number =
				(options.toggle ? OperationType.Toggle : OperationType.Write) << 4
				| (options.signalType == "analog" ? DataControl.Analog : DataControl.Empty)
				| (options.direction == "input" ? DataControl.Input : DataControl.Empty)
				| (options.delayLow > 0 ? DataType.Int : DataControl.Empty);
			buf[0] = this.canAddresses.readPort;
			buf[1] = commControl;
			buf[2] = dataCtrl;
			buf[3] = options.portId;
			Buffer.from([data >> 24, data >> 16, data >> 8, data]).copy(buf, 4);

			unsubscribe = this.can.subscribe((frame: CanFrame) => {
				let payload = this.parseFrame(frame);
				if (payload.to == this.canAddresses.readPort
					&& payload.commControl.isCommand == true
					&& payload.commControl.isAcknowledge == true
					&& (payload.dataCtrl.isWrite == true || payload.dataCtrl.isToggle == true)
					&& payload.port == options.portId
				) {
					resolve(payload.data);
				}
			});
			
			this.can.send(options.iface, {
				id: options.deviceId,
				data: buf
			});
		})
		.timeout(this.timeout.command)
		.finally(() => {
			unsubscribe();
		});
	}
	
	public async ping(options: { iface: string, deviceId: number }) {
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
			}, this.timeout.grace);
			unsubscribe = this.can.subscribe((frame: CanFrame) => {
				let payload = this.parseFrame(frame);
				if (payload.to == this.canAddresses.ping
					&& payload.commControl.isCommand == true
					&& payload.commControl.isPing == true
					&& payload.commControl.isAcknowledge == true
				) {
					if (options.deviceId != this.canAddresses.broadcast) {
						deviceList.push(payload.from);
					} else {
						resolve([payload.from]);
						timeout.close();
					}
				}
			});

			this.can.send(options.iface, {
				id: options.deviceId,
				data: buf
			});
		})
		.timeout(this.timeout.ping)
		.finally(() => {
			unsubscribe();
		});
	}

	public async discover(options: { iface: string }) {
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
			}, this.timeout.grace);
			unsubscribe = this.can.subscribe((frame: CanFrame) => {
				let payload = this.parseFrame(frame);
				if (payload.to == this.canAddresses.discover
					&& payload.commControl.isCommand == true
					&& payload.commControl.isDiscovery == true
					&& payload.commControl.isAcknowledge == true
				) {
					deviceList.push(payload.from);
				}
			});

			this.can.send(options.iface, {
				id: this.canAddresses.broadcast,
				data: buf
			});
		})
		.timeout(this.timeout.discover)
		.finally(() => {
			unsubscribe();
		});
	}

	public async setConfig(options: { iface: string, deviceId: number, config: DeviceConfigDto[] }) {
		await new ExtraPromise(async (resolve, reject) => {
			for (let idxPort = 0; idxPort < options.config.length; idxPort++) {
				let inputConfig = options.config[idxPort];

				// Loop through the actions
				for (const configType in inputConfig) {
					const value = inputConfig[configType];

					if (configType == "Actions") {
						// Remove all actions before inserting new set of actions
						await this.sendConfig({
							...options, idxPort,
							configType: "Actions", 
							data: 0
						});

						// Loop thorugh set of actions
						for (const action of inputConfig[configType]) {
							let data = action.deviceId << 16 | this.portsToHex(action.ports);
							await this.sendConfig({
								...options, idxPort,
								configType: action.type == ActionType.TOGGLE ? "ActionToggle" : action.type == ActionType.HIGH ? "ActionHigh" : "ActionLow",
								data: data
							});
						}
					} else {
						await this.sendConfig({
							...options,
							idxPort,
							configType,
							data: value
						});
					}
				}
			}
			resolve(true);
		})
		.timeout(this.timeout.config)
		.catch((error) => error);
	}

	private async sendConfig(options: { iface: string, deviceId: number, idxPort: number, configType: string, data: number }) {
		let unsubscribe: Unsubscribe = () => {};
		await new ExtraPromise((resolve, reject) => {
			// Construct buffer
			let commControl: number = CommControl.Command;
			let dataCtrl: number = DataControl.Config | DataControl.Input | (OperationType.Write << 4);
			let buf: Buffer = Buffer.alloc(8);
			buf[0] = this.canAddresses.writeConfig;
			buf[1] = commControl;
			buf[2] = dataCtrl;
			buf[3] = options.idxPort;
			buf[4] = ConfigType[options.configType];
			Buffer.from([options.data >> 16, options.data >> 8, options.data]).copy(buf, 5);

			// Subscribe for ACK
			unsubscribe = this.can.subscribe((frame: CanFrame) => {
				let payload = this.parseFrame(frame);
				if (
					payload.to == this.canAddresses.writeConfig &&
					payload.from == options.deviceId &&
					payload.commControl.isCommand == true &&
					payload.commControl.isAcknowledge == true &&
					payload.dataCtrl.isConfig == true &&
					payload.dataCtrl.isInput == true &&
					payload.dataCtrl.isWrite == true &&
					payload.configCtrl == ConfigType[options.configType]
				) {
					resolve(payload);
				}
			});

			// Send data
			this.can.send(options.iface, {
				id: options.deviceId,
				data: buf
			});
		})
		.timeout(this.timeout.configSingle)
		.catch((error) => error)
		.finally(() => unsubscribe());
	}

	public async getConfig(options: { iface: string, deviceId: number }) {
		// Extract Keys and values from ConfigType
		const configNames = Object.keys(ConfigType).filter(k => isNaN(Number(k)));
		const configValues = Object.values(ConfigType).filter(v => typeof v === "number") as number[];

		let deviceConfig: any = [];
		
		for (let idxPort = 0; idxPort < 16; idxPort++) {
			let inputConfig = {};
			for (let configIdx = 0; configIdx < configNames.length; configIdx++){
				if (["ActionToggle", "ActionHigh", "ActionLow"].includes(configNames[configIdx])) {
					continue;
				}
				let unsubscribe: Unsubscribe = () => {};
				let configValue = await new ExtraPromise<number | ActionDto[]>((resolve, reject) => {
					// Construct config for each input port
					let commControl : number = CommControl.Command;
					let dataCtrl : number = DataControl.Config | DataControl.Input; // !DataControl.Write
					let buf : Buffer = Buffer.alloc(8);
					let actionData: ActionDto[] = [];
					buf[0] = this.canAddresses.readConfig;
					buf[1] = commControl;
					buf[2] = dataCtrl;
					buf[3] = idxPort;
					buf[4] = Number(configValues[configIdx]);

					unsubscribe = this.can.subscribe((frame: CanFrame) => {
						let payload = this.parseFrame(frame);
						if (payload.to == this.canAddresses.readConfig
							&& payload.commControl.isCommand == true
							&& payload.commControl.isAcknowledge == true
							&& payload.dataCtrl.isConfig == true
							&& payload.dataCtrl.isInput
							&& (payload.configCtrl == Number(configValues[configIdx]) || [ConfigType.ActionHigh, ConfigType.ActionLow, ConfigType.ActionToggle].includes(payload.configCtrl) && configNames[configIdx] == "Actions")
						) {
							if (configNames[configIdx] == "Actions") {
								if (payload.configCtrl == Number(configValues[configIdx])) {
									if (!payload.commControl.isWait) {
										resolve(actionData);
									}
								} else {
									let deviceId = payload.data >> 16;
									if (deviceId != 0xFF) {
										actionData.push({
											deviceId,
											type: payload.configCtrl == ConfigType.ActionToggle ? ActionType.TOGGLE : payload.configCtrl == ConfigType.ActionHigh ? ActionType.HIGH : ActionType.LOW,
											ports: this.hexToPorts(payload.data & 0xFFFF)
										})
									}
								}
							} else {
								resolve(payload.data);
							}
						}
					});

					this.can.send(options.iface, {
						id: options.deviceId,
						data: buf
					});
				})
				.timeout(this.timeout.config)
				.finally(() => {
					unsubscribe();
				});
				inputConfig[configNames[configIdx]] = configValue;
			}
			deviceConfig.push(inputConfig);
		}
		return deviceConfig;
	}

	public async writeEEPROM(iface: string, deviceId: number) {
		let unsubscribe: Unsubscribe = () => {};
		
		await new ExtraPromise((resolve, reject) => {
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
		.timeout(this.timeout.EEPROM)
		.finally(() => {
			unsubscribe();
		});

		return true;
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
			isWait: frame.data[1] & CommControl.Wait ? true : false,
			isError: frame.data[1] & CommControl.Error ? true : false
		};
		let dataCtrl = {
			isConfig : frame.data[2] & DataControl.Config ? true : false,
			isWriteEEPROM : frame.data[2] & DataControl.WriteEEPROM ? true : false,
			isRead : (frame.data[2] & DataControl.Operation) >> 4 == OperationType.Read ? true : false,
			isWrite : (frame.data[2] & DataControl.Operation) >> 4 == OperationType.Write ? true : false,
			isToggle : (frame.data[2] & DataControl.Operation) >> 4 == OperationType.Toggle ? true : false,
			isAnalog : frame.data[2] & DataControl.Analog ? true : false,
			isInput : frame.data[2] & DataControl.Input ? true : false,
			dataType : (frame.data[2] & DataControl.DataType),
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

	private hexToPorts(hex: number, numPorts: number = 15): number[] {
		// Transform hex into array of ports
		let ports: number[] = [];
		for (let i = 0; i < numPorts; i++) {
			if (((hex >> i) & 0x01) == 1) {
				ports.push(i);
			}
		}

		// Return array of ports
		return ports;
	}

	private portsToHex(ports: number[]): number {
		let hex = 0x0;
		for (let port of ports) {
			hex = hex | (1 << (port));
		}
		return hex;
	}
}