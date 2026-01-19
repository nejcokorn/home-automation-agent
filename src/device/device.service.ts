import { Injectable } from "@nestjs/common";
import { Can, CanFrame } from "src/can/can.types";
import { CommunicationCtrl, DataControl, CommandOperations, ConfigOperations, DeviceFrame, ActionType, ActionMode, ActionTrigger } from "src/device/device.types";
import { LoggerExtra } from "src/extras/logger.extra";
import { ExtraPromise } from "src/extras/promise.extra";
import { CanService } from "src/can/can.service";
import { DeviceConfigDto, ActionDto } from "./device.dto";

type Unsubscribe = () => void;

// Gropu of general configurations
const generalConfigs = [
	ConfigOperations.debounce,
	ConfigOperations.doubleclick,
	ConfigOperations.actions,
	ConfigOperations.bypassInstantly,
	ConfigOperations.bypassOnDIPSwitch,
	ConfigOperations.bypassOnDisconnect,
]

// Group of action configurations
const actionConfigs = [
	ConfigOperations.actionBase,
	ConfigOperations.actionPorts,
	ConfigOperations.actionSkipWhenDelay,
	ConfigOperations.actionClearDelays,
	ConfigOperations.actionDelay,
	ConfigOperations.actionLongpress,
]

const numToActionTrigger = {
	0: 'disabled',
	1: 'rising',
	2: 'falling',
}

const actionTriggerToNum = {
	'disabled': 0,
	'rising':   1,
	'falling':  2,
}

const numToActionType = {
	0: 'low',
	1: 'high',
	2: 'toggle',
	3: 'pwm',
}

const actionTypeToNum = {
	low:          0,
	high:         1,
	toggle:       2,
	pwm:          3,
}

const actionModeToNum = {
	click:       0,
	longpress:   1,
	doubleclick: 2,
}

const numToActionMode = {
	0: 'click',
	1: 'longpress',
	2: 'doubleclick',
}

@Injectable()
export class DeviceService {
	private readonly logger = new LoggerExtra(DeviceService.name);

	private unsubscribeEvents: Unsubscribe = () => {};
	private listeners = new Set<(event: DeviceFrame) => void>();
	private commandIdSequence: number = 0;
	private timeout = {
		command: 10,
		config: 2000,
		configSingle: 25,
		grace: 70,
		ping: 100,
		discover: 100,
		EEPROM: 1000,
		listDelays: 1000,
		clearDelay: 50,
	}

	canAddresses = {
		getPort:     0xF0,
		setPort:     0xF1,
		discover:    0xF2,
		ping:        0xF3,
		getConfig:   0xF4,
		setConfig:   0xF5,
		writeEEPROM: 0xF6,
		listDelays:  0xF7,
		clearDelay:  0xF8,
		broadcast:   0x0FF,
	}

	constructor(
		private readonly canService: CanService
	) {}

	public async getPort(options: { iface: string, deviceId: number, signalType: string, direction: string, portId: number }) {
		let unsubscribe: Unsubscribe = () => {};
		
		return await new ExtraPromise((resolve, reject) => {
			let packageId: number = this.nextPackageId(this.canAddresses.getPort, options.deviceId);
			let commControl: number = CommunicationCtrl.empty;
			let dataCtrl: number =
				DataControl.commandBit
				| (options.signalType == DataControl[DataControl.analog] ? DataControl.analog : DataControl.digital)
				| (options.direction == DataControl[DataControl.input] ? DataControl.input : DataControl.output)
			let operation = 0x00;

			let buf: Buffer = Buffer.alloc(8);
			buf[0] = commControl;
			buf[1] = dataCtrl;
			buf[2] = operation;
			buf[3] = options.portId;

			unsubscribe = this.canService.subscribe((can: Can, frame: CanFrame) => {
				let payload = this.parseFrame(frame);
				if (payload.packageId == packageId
					&& payload.commControl.isAcknowledge == true
					&& payload.dataCtrl.isCommand == true
					&& payload.command.operation == CommandOperations.get
					&& payload.port == options.portId
				) {
					resolve(payload.data);
				}
			});
			
			this.canService.send(options.iface, {
				id: packageId,
				data: buf,
				ext: true
			});
		})
		.timeout(this.timeout.command)
		.finally(() => {
			unsubscribe();
		});
	}

	public async setPort(options: { iface: string, deviceId: number, signalType: string, direction: string, portId: number, type: ActionType, delay: number, extra: number }) {
		let unsubscribe: Unsubscribe = () => {};
		
		return await new ExtraPromise((resolve, reject) => {
			let packageId: number = this.nextPackageId(this.canAddresses.setPort, options.deviceId);
			let type: number = actionTypeToNum[options.type];
			let commControl: number = options.delay > 0 ? CommunicationCtrl.waitBit : CommunicationCtrl.empty;
			let dataCtrl: number =
				DataControl.commandBit
				| (options.signalType == DataControl[DataControl.analog] ? DataControl.analog : DataControl.digital)
				| (options.direction == DataControl[DataControl.input] ? DataControl.input : DataControl.output)
				| DataControl.integer;
			let operation = CommandOperations.set;
			
			let buf: Buffer = Buffer.alloc(8);
			buf[0] = commControl;
			buf[1] = dataCtrl;
			buf[2] = operation;
			buf[3] = options.portId;
			Buffer.from([type >> 24, type >> 16, type >> 8, type]).copy(buf, 4);

			unsubscribe = this.canService.subscribe((can: Can, frame: CanFrame) => {
				let payload = this.parseFrame(frame);
				if (payload.packageId == packageId
					&& payload.commControl.isAcknowledge == true
					&& payload.dataCtrl.isCommand == true
					&& payload.port == options.portId
				) {
					resolve(payload.data);
				}
			});

			this.canService.send(options.iface, {
				id: packageId,
				data: buf,
				ext: true
			});

			if (options.delay > 0) {
				commControl = CommunicationCtrl.empty;
				operation = CommandOperations.delay;

				buf[0] = commControl;
				buf[1] = dataCtrl;
				buf[2] = operation;
				buf[3] = options.portId;
				Buffer.from([options.delay >> 24, options.delay >> 16, options.delay >> 8, options.delay]).copy(buf, 4);

				this.canService.send(options.iface, {
					id: packageId,
					data: buf,
					ext: true
				});
			}
		})
		.timeout(this.timeout.command)
		.finally(() => {
			unsubscribe();
		});
	}
	
	public async ping(options: { iface: string, deviceId: number }) {
		let unsubscribe: Unsubscribe = () => {};
		
		return await new ExtraPromise((resolve, reject) => {
			let packageId: number = this.nextPackageId(this.canAddresses.ping, options.deviceId);
			let deviceList: number[] = [];
			let commControl: number = CommunicationCtrl.pingBit;
			let dataCtrl: number = DataControl.commandBit;

			let buf: Buffer = Buffer.alloc(8);
			buf[0] = commControl;
			buf[1] = dataCtrl;

			let timeout = setTimeout(() => {
				resolve(deviceList);
			}, this.timeout.grace);
			unsubscribe = this.canService.subscribe((can: Can, frame: CanFrame) => {
				let payload = this.parseFrame(frame);
				if (payload.packageId == packageId
					&& payload.commControl.isAcknowledge == true
					&& payload.commControl.isPing == true
					&& payload.dataCtrl.isCommand == true
				) {
					if (options.deviceId != this.canAddresses.broadcast) {
						deviceList.push(payload.data);
					} else {
						resolve([payload.data]);
						timeout.close();
					}
				}
			});

			this.canService.send(options.iface, {
				id: packageId,
				data: buf,
				ext: true
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
			let packageId: number = this.nextPackageId(this.canAddresses.discover, this.canAddresses.broadcast);
			let deviceList: number[] = [];
			let commControl: number = CommunicationCtrl.discoveryBit;
			let dataCtrl: number = DataControl.commandBit;

			let buf: Buffer = Buffer.alloc(8);
			buf[0] = commControl;
			buf[1] = dataCtrl;

			let timeout = setTimeout(() => {
				resolve(deviceList);
			}, this.timeout.grace);
			unsubscribe = this.canService.subscribe((can: Can, frame: CanFrame) => {
				let payload = this.parseFrame(frame);
				if (payload.packageId == packageId
					&& payload.commControl.isDiscovery == true
					&& payload.commControl.isAcknowledge == true
					&& payload.dataCtrl.isCommand == true
				) {
					deviceList.push(payload.data);
				}
			});

			this.canService.send(options.iface, {
				id: packageId,
				data: buf,
				ext: true
			});
		})
		.timeout(this.timeout.discover)
		.finally(() => {
			unsubscribe();
		});
	}

	public async setConfig(options: { iface: string, deviceId: number, config: DeviceConfigDto[] }) {
		await new ExtraPromise(async (resolve, reject) => {
			for (const inputConfig of options.config) {

				// Loop through the actions
				for (const configType in inputConfig) {
					const value = inputConfig[configType];

					if (configType == ConfigOperations[ConfigOperations.actions]) {
						// Remove all actions before inserting new set of actions
						await this.sendConfig({
							...options,
							inputPortIdx: inputConfig.inputPortIdx,
							configType: ConfigOperations[ConfigOperations.actions], 
							data: 0
						});

						// Loop thorugh set of actions
						for (const action of inputConfig[configType]) {
							let trigger: number = actionTriggerToNum[action.trigger];
							let type: number = actionTypeToNum[action.type];
							let mode: number = actionModeToNum[action.mode];

							// P1 - action base
							await this.sendConfig({
								...options,
								inputPortIdx: inputConfig.inputPortIdx,
								configType: ConfigOperations[ConfigOperations.actionBase],
								data: trigger << 16 | mode << 8 | type
							});

							// P2 - action ports
							await this.sendConfig({
								...options,
								inputPortIdx: inputConfig.inputPortIdx,
								configType: ConfigOperations[ConfigOperations.actionPorts],
								data: (action.output.deviceId ? action.output.deviceId : 0xFF) << 24 | this.portsToHex(action.output.ports)
							});

							// P3 - action ports
							await this.sendConfig({
								...options,
								inputPortIdx: inputConfig.inputPortIdx,
								configType: ConfigOperations[ConfigOperations.actionSkipWhenDelay],
								data: (action.output.skipWhenDelayDeviceId ? action.output.skipWhenDelayDeviceId : 0xFF) << 24 | this.portsToHex(action.output.skipWhenDelayPorts)
							});

							// P4 - action ports
							await this.sendConfig({
								...options,
								inputPortIdx: inputConfig.inputPortIdx,
								configType: ConfigOperations[ConfigOperations.actionClearDelays],
								data: (action.output.clearDelayDeviceId ? action.output.clearDelayDeviceId : 0xFF) << 24 | this.portsToHex(action.output.clearDelayPorts)
							});

							// P5 - action delay
							await this.sendConfig({
								...options,
								inputPortIdx: inputConfig.inputPortIdx,
								configType: ConfigOperations[ConfigOperations.actionDelay],
								data: action.output.delay
							});

							// P6 - action longpress
							await this.sendConfig({
								...options,
								inputPortIdx: inputConfig.inputPortIdx,
								configType: ConfigOperations[ConfigOperations.actionLongpress],
								data: action.longpress
							});
						}
					} else if (Object.values(ConfigOperations).filter(v => typeof v === "string").includes(configType)){
						await this.sendConfig({
							...options,
							inputPortIdx: inputConfig.inputPortIdx,
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

	private async sendConfig(options: { iface: string, deviceId: number, inputPortIdx: number, configType: string, data: number }) {
		let unsubscribe: Unsubscribe = () => {};
		await new ExtraPromise((resolve, reject) => {
			let packageId: number = this.nextPackageId(this.canAddresses.setConfig, options.deviceId);
			// Construct buffer
			let commControl: number = CommunicationCtrl.empty;
			let dataCtrl: number = DataControl.configBit;
			let operation: number = ConfigOperations.set | ConfigOperations[options.configType];

			let buf: Buffer = Buffer.alloc(8);
			buf[0] = commControl;
			buf[1] = dataCtrl;
			buf[2] = operation;
			buf[3] = options.inputPortIdx;
			Buffer.from([options.data >> 24, options.data >> 16, options.data >> 8, options.data]).copy(buf, 4);

			// Subscribe for ACK
			unsubscribe = this.canService.subscribe((can: Can, frame: CanFrame) => {
				let payload = this.parseFrame(frame);
				if (
					payload.packageId == packageId
					&& payload.commControl.isAcknowledge == true
					&& payload.dataCtrl.isConfig == true
					&& payload.config.isSet == true
					&& payload.config.operation == ConfigOperations[options.configType]
				) {
					resolve(payload);
				}
			});

			// Send data
			this.canService.send(options.iface, {
				id: packageId,
				data: buf,
				ext: true
			});
		})
		.timeout(this.timeout.configSingle)
		.catch((error) => error)
		.finally(() => unsubscribe());
	}

	public async getConfig(options: { iface: string, deviceId: number }): Promise<DeviceConfigDto> {
		// Initialize configuration object
		let deviceConfig: any = [];
		
		for (let inputPortIdx = 0; inputPortIdx < 16; inputPortIdx++) {
			let inputConfig = {
				inputPortIdx
			};
			for (let config of generalConfigs) {
				let unsubscribe: Unsubscribe = () => {};
				let configValue = await new ExtraPromise<number | ActionDto[]>((resolve, reject) => {
					let packageId: number = this.nextPackageId(this.canAddresses.getConfig, options.deviceId);
					// Construct config for each input port
					let commControl: number = CommunicationCtrl.empty;
					let dataCtrl: number = DataControl.configBit;
					let operation: number = ConfigOperations.get | config;
					
					let buf: Buffer = Buffer.alloc(8);
					buf[0] = commControl;
					buf[1] = dataCtrl;
					buf[2] = operation;
					buf[3] = inputPortIdx;

					// Config data retrived from device
					let actionData: ActionDto[] = [];
					let lastAction: ActionDto;

					unsubscribe = this.canService.subscribe((can: Can, frame: CanFrame) => { 
						let payload = this.parseFrame(frame);
						if (payload.packageId == packageId
							&& payload.commControl.isAcknowledge == true
							&& payload.dataCtrl.isConfig == true
							&& (payload.config.operation == config || actionConfigs.includes(payload.config.operation) && config == ConfigOperations.actions)
						) {
							if (config == ConfigOperations.actions) {
								console.log(payload);
								// This will indicate last action from device
								switch (payload.config.operation) {
									case ConfigOperations.actions:
										// This should be last acknoweadge package
										break;
									case ConfigOperations.actionPorts:
										lastAction.output.deviceId = payload.data >>> 24;
										lastAction.output.ports = this.hexToPorts(payload.data & 0xFFF);
										break;
									case ConfigOperations.actionSkipWhenDelay:
										let skipWhenDelayDeviceId = payload.data >>> 24;
										lastAction.output.skipWhenDelayDeviceId = skipWhenDelayDeviceId != 0xFF ? skipWhenDelayDeviceId : null;
										lastAction.output.skipWhenDelayPorts = this.hexToPorts(payload.data & 0xFFF);
										break;
									case ConfigOperations.actionClearDelays:
										let clearDelayDeviceId = payload.data >>> 24;
										lastAction.output.clearDelayDeviceId = clearDelayDeviceId != 0xFF ? clearDelayDeviceId : null;
										lastAction.output.clearDelayPorts = this.hexToPorts(payload.data & 0xFFF);
										break;
									case ConfigOperations.actionDelay:
										lastAction.output.delay = payload.data;
										break;
									case ConfigOperations.actionLongpress:
										lastAction.longpress = payload.data;
										break;
									case ConfigOperations.actionBase:
										let trigger: ActionTrigger = numToActionTrigger[(payload.data >> 16) & 0xFF];
										let mode: ActionMode = numToActionMode[(payload.data >> 8) & 0xFF];
										let type: ActionType = numToActionType[(payload.data & 0xFF)];

										// Set object
										lastAction = {
											trigger,
											mode,
											type,
											longpress: 0,
											output: {
												skipWhenDelayDeviceId: 0xFF,
												skipWhenDelayPorts: [],
												clearDelayDeviceId: 0xFF,
												clearDelayPorts: [],
												deviceId: 0xFF,
												ports: [],
												delay: 0,
											}
										}
										actionData.push(lastAction);
										break;
								}

								// Another check if this is the last package
								if (!payload.commControl.isWait) {
									resolve(actionData);
								}
							} else {
								return resolve(payload.data);
							}
						}
					});

					this.canService.send(options.iface, {
						id: packageId,
						data: buf,
						ext: true
					});
				})
				.timeout(this.timeout.config)
				.finally(() => {
					unsubscribe();
				});
				// Set configuration parameter
				inputConfig[ConfigOperations[config]] = configValue;
			}
			deviceConfig.push(inputConfig);
		}
		return deviceConfig;
	}

	public async writeEEPROM(iface: string, deviceId: number) {
		let unsubscribe: Unsubscribe = () => {};
		
		return new ExtraPromise((resolve, reject) => {
			let packageId: number = this.nextPackageId(this.canAddresses.writeEEPROM, deviceId);
			let commControl: number = CommunicationCtrl.empty;
			let dataCtrl: number = DataControl.configBit;
			let operation: number = ConfigOperations.set | ConfigOperations.writeEEPROM;
			
			let buf: Buffer = Buffer.alloc(8);
			buf[0] = commControl;
			buf[1] = dataCtrl;
			buf[2] = operation;

			unsubscribe = this.canService.subscribe((can: Can, frame: CanFrame) => {
				let payload = this.parseFrame(frame);
				console.log(payload);
				
				if (payload.packageId == packageId
					&& payload.commControl.isAcknowledge == true
					&& payload.config.operation == ConfigOperations.writeEEPROM
				) {
					resolve(payload.data);
				}
			});
			
			this.canService.send(iface, {
				id: packageId,
				data: buf,
				ext: true
			});
		})
		.timeout(this.timeout.EEPROM)
		.finally(() => {
			unsubscribe();
		});
	}

	public async listDelays(iface: string, deviceId: number){
		let unsubscribe: Unsubscribe = () => {};
		
		return new ExtraPromise((resolve, reject) => {
			let packageId: number = this.nextPackageId(this.canAddresses.listDelays, deviceId);
			let commControl: number = CommunicationCtrl.empty;
			let dataCtrl: number = DataControl.commandBit;
			let operation: number = CommandOperations.listDelays;
			
			let delays: { id: number, deviceId: number, execute: boolean, delay: number, port:number, type: ActionType }[] = [];
			let delay: { id: number, deviceId: number, execute: boolean, delay: number, port:number, type: ActionType };
			let packageNum = 1;
			
			let buf: Buffer = Buffer.alloc(8);
			buf[0] = commControl;
			buf[1] = dataCtrl;
			buf[2] = operation;

			unsubscribe = this.canService.subscribe((can: Can, frame: CanFrame) => {
				let payload = this.parseFrame(frame);
				if (payload.packageId == packageId
					&& payload.commControl.isAcknowledge == true
					&& payload.command.operation == CommandOperations.listDelays
				) {
					if (payload.commControl.isWait) {
						switch (packageNum) {
							case 1:
								delay = {
									id: payload.data,
									deviceId: 0xFF,
									execute: false,
									port: payload.port,
									type: ActionType.low,
									delay: 0,
								}
							case 2:
								delay.deviceId = payload.data;
								break;
							case 3:
								delay.execute = payload.data == 1 ? true : false;
								break;
							case 4:
								delay.type = numToActionType[(payload.data & 0xFF)]
								break;
							case 5:
								delay.delay = payload.data;
								delays.push(delay);
								packageNum = 0;
								break;
						}
						packageNum++;
					} else {
						resolve(delays);
					}
				}
			});
			
			this.canService.send(iface, {
				id: packageId,
				data: buf,
				ext: true
			});
		})
		.timeout(this.timeout.listDelays)
		.finally(() => {
			unsubscribe();
		});
	}

	public async clearDelay(iface, deviceId, delayId) {
		let unsubscribe: Unsubscribe = () => {};
		
		return new ExtraPromise((resolve, reject) => {
			let packageId: number = this.nextPackageId(this.canAddresses.clearDelay, deviceId);
			let commControl: number = CommunicationCtrl.empty;
			let dataCtrl: number = DataControl.commandBit;
			let operation: number = CommandOperations.clearDelayById;
			
			let buf: Buffer = Buffer.alloc(8);
			buf[0] = commControl;
			buf[1] = dataCtrl;
			buf[2] = operation;
			buf[3] = 0xFF;
			Buffer.from([delayId >> 24, delayId >> 16, delayId >> 8, delayId]).copy(buf, 4);

			unsubscribe = this.canService.subscribe((can: Can, frame: CanFrame) => {
				let payload = this.parseFrame(frame);
				if (payload.packageId == packageId) {
					if (payload.commControl.isAcknowledge) {
						resolve(payload.commControl.isAcknowledge);
					} else {
						reject(new Error("Delay could not be deleted!"));
					}
				}
			});
			
			this.canService.send(iface, {
				id: packageId,
				data: buf,
				ext: true
			});
		})
		.timeout(this.timeout.clearDelay)
		.finally(() => {
			unsubscribe();
		});
	}

	parseFrame(frame: CanFrame): DeviceFrame {
		let packageId = frame.id;
		let commandId = frame.id >> 16;
		let initiatorId = (frame.id & 0xFF00) >> 8
		let responderId = frame.id & 0xFF;
		// let from = frame.data[0];
		let commControl = {
			isDiscovery: frame.data[0] & CommunicationCtrl.discoveryBit ? true : false,
			isPing: frame.data[0] & CommunicationCtrl.pingBit ? true : false,
			isAcknowledge: frame.data[0] & CommunicationCtrl.acknowledgeBit ? true : false,
			isWait: frame.data[0] & CommunicationCtrl.waitBit ? true : false,
			isError: frame.data[0] & CommunicationCtrl.errorBit ? true : false
		};
		let dataCtrl = {
			isCommand: frame.data[1] & DataControl.commandBit ? true : false,
			isConfig: frame.data[1] & DataControl.configBit ? true : false,
			isAnalog: frame.data[1] & DataControl.analog ? true : false,
			isDigital: !(frame.data[1] & DataControl.analog) ? true : false,
			isInput: frame.data[1] & DataControl.input ? true : false,
			isOutput: !(frame.data[1] & DataControl.input) ? true : false,
			dataType: frame.data[1] & DataControl.dataTypeBit,
		};
		let command = {
			operation: frame.data[2]
		};
		let config = {
			isGet: (frame.data[2] & 0x80) == 0x80 ? false : true,
			isSet: (frame.data[2] & 0x80) == 0x00 ? true : false,
			operation: (frame.data[2] & 0x7F)
		};
		let port = frame.data[3];
		let data = (frame.data[4] << 24) |
				(frame.data[5] << 16) |
				(frame.data[6] << 8) |
				frame.data[7];
		
		return {
			packageId,
			commandId,
			initiatorId,
			responderId,
			commControl,
			dataCtrl,
			command,
			config,
			port,
			data
		}
	}

	private nextPackageId(initiatorId: number, responderId): number {
	if (this.commandIdSequence > 0x1FFF) {
		this.commandIdSequence == 0;
	}
	let packageId = this.commandIdSequence << 16 | initiatorId << 8 | responderId;
	this.commandIdSequence++;
	return packageId;
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