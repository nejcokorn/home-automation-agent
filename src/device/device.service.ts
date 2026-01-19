import { Injectable } from "@nestjs/common";
import { Can, CanFrame } from "src/can/can.types";
import { CommCtrl, DataCtrl, CommandOper, ConfigOper, DeviceFrame, ActionType, ActionMode, ActionTrigger } from "src/device/device.types";
import { LoggerExtra } from "src/extras/logger.extra";
import { ExtraPromise } from "src/extras/promise.extra";
import { CanService } from "src/can/can.service";
import { DeviceConfigDto, ActionDto } from "./device.dto";

type Unsubscribe = () => void;

// Gropu of general configurations
const generalOper = [
	ConfigOper.debounce,
	ConfigOper.doubleclick,
	ConfigOper.actions,
	ConfigOper.bypassInstantly,
	ConfigOper.bypassOnDIPSwitch,
	ConfigOper.bypassOnDisconnect,
]

// Group of action configurations
const actionOper = [
	ConfigOper.actionBase,
	ConfigOper.actionPorts,
	ConfigOper.actionSkipWhenDelay,
	ConfigOper.actionClearDelays,
	ConfigOper.actionDelay,
	ConfigOper.actionLongpress,
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
			let commCtrl: number = CommCtrl.empty;
			let dataCtrl: number =
				DataCtrl.commandBit
				| (options.signalType == DataCtrl[DataCtrl.analog] ? DataCtrl.analog : DataCtrl.digital)
				| (options.direction == DataCtrl[DataCtrl.input] ? DataCtrl.input : DataCtrl.output)
			let operation = 0x00;

			let buf: Buffer = Buffer.alloc(8);
			buf[0] = commCtrl;
			buf[1] = dataCtrl;
			buf[2] = operation;
			buf[3] = options.portId;

			unsubscribe = this.canService.subscribe((can: Can, frame: CanFrame) => {
				let payload = this.parseFrame(frame);
				if (payload.packageId == packageId) {
					if (payload.commCtrl.isAcknowledge
						&& !payload.commCtrl.isError
						&& payload.dataCtrl.isCommand == true
						&& payload.command.operation == CommandOper.get
					) {
						resolve(payload.data);
					} else {
						reject(new Error("Could not get the device port!"));
					}
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
			let commCtrl: number = options.delay > 0 ? CommCtrl.waitBit : CommCtrl.empty;
			let dataCtrl: number =
				DataCtrl.commandBit
				| (options.signalType == DataCtrl[DataCtrl.analog] ? DataCtrl.analog : DataCtrl.digital)
				| (options.direction == DataCtrl[DataCtrl.input] ? DataCtrl.input : DataCtrl.output)
				| DataCtrl.integer;
			let operation = CommandOper.set;
			
			let buf: Buffer = Buffer.alloc(8);
			buf[0] = commCtrl;
			buf[1] = dataCtrl;
			buf[2] = operation;
			buf[3] = options.portId;
			Buffer.from([type >> 24, type >> 16, type >> 8, type]).copy(buf, 4);

			unsubscribe = this.canService.subscribe((can: Can, frame: CanFrame) => {
				let payload = this.parseFrame(frame);
				if (payload.packageId == packageId) {
					if (payload.commCtrl.isAcknowledge == true
						&& !payload.commCtrl.isError == true
						&& payload.dataCtrl.isCommand == true
						&& payload.port == options.portId
					) {
						resolve(payload.data);
					} else {
						reject(new Error("Could not set the device port!"));
					}
				}
			});

			this.canService.send(options.iface, {
				id: packageId,
				data: buf,
				ext: true
			});

			if (options.delay > 0) {
				commCtrl = CommCtrl.empty;
				operation = CommandOper.delay;

				buf[0] = commCtrl;
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
			let commCtrl: number = CommCtrl.pingBit;
			let dataCtrl: number = DataCtrl.commandBit;

			let buf: Buffer = Buffer.alloc(8);
			buf[0] = commCtrl;
			buf[1] = dataCtrl;

			let timeout = setTimeout(() => {
				resolve(deviceList);
			}, this.timeout.grace);
			unsubscribe = this.canService.subscribe((can: Can, frame: CanFrame) => {
				let payload = this.parseFrame(frame);
				if (payload.packageId == packageId) {
					if (payload.commCtrl.isAcknowledge == true
						&& !payload.commCtrl.isError == true
						&& payload.commCtrl.isPing == true
						&& payload.dataCtrl.isCommand == true
					) {
						if (options.deviceId != this.canAddresses.broadcast) {
							deviceList.push(payload.data);
						} else {
							resolve([payload.data]);
							timeout.close();
						}
					} else {
						reject(new Error("Ping was unsuccessful."));
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
			let commCtrl: number = CommCtrl.discoveryBit;
			let dataCtrl: number = DataCtrl.commandBit;

			let buf: Buffer = Buffer.alloc(8);
			buf[0] = commCtrl;
			buf[1] = dataCtrl;

			let timeout = setTimeout(() => {
				resolve(deviceList);
			}, this.timeout.grace);
			unsubscribe = this.canService.subscribe((can: Can, frame: CanFrame) => {
				let payload = this.parseFrame(frame);
				if (payload.packageId == packageId) {
					if (payload.commCtrl.isAcknowledge == true
						&& !payload.commCtrl.isError == true
						&& payload.commCtrl.isDiscovery == true
						&& payload.dataCtrl.isCommand == true
					) {
						deviceList.push(payload.data);
					} else {
						reject(new Error("Failed to retrieve the list of devices."));
					}
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
				for (const configOper in inputConfig) {
					const value = inputConfig[configOper];

					if (configOper == ConfigOper[ConfigOper.actions]) {
						// Remove all actions before inserting new set of actions
						await this.sendConfig({
							...options,
							inputPortIdx: inputConfig.inputPortIdx,
							configOper: ConfigOper[ConfigOper.actions], 
							data: 0
						});

						// Loop thorugh set of actions
						for (const action of inputConfig[configOper]) {
							let trigger: number = actionTriggerToNum[action.trigger];
							let type: number = actionTypeToNum[action.type];
							let mode: number = actionModeToNum[action.mode];

							// P1 - action base
							await this.sendConfig({
								...options,
								inputPortIdx: inputConfig.inputPortIdx,
								configOper: ConfigOper[ConfigOper.actionBase],
								data: trigger << 16 | mode << 8 | type
							});

							// P2 - action ports
							await this.sendConfig({
								...options,
								inputPortIdx: inputConfig.inputPortIdx,
								configOper: ConfigOper[ConfigOper.actionPorts],
								data: (action.output.deviceId ? action.output.deviceId : 0xFF) << 24 | this.portsToHex(action.output.ports)
							});

							// P3 - action ports
							await this.sendConfig({
								...options,
								inputPortIdx: inputConfig.inputPortIdx,
								configOper: ConfigOper[ConfigOper.actionSkipWhenDelay],
								data: (action.output.skipWhenDelayDeviceId ? action.output.skipWhenDelayDeviceId : 0xFF) << 24 | this.portsToHex(action.output.skipWhenDelayPorts)
							});

							// P4 - action ports
							await this.sendConfig({
								...options,
								inputPortIdx: inputConfig.inputPortIdx,
								configOper: ConfigOper[ConfigOper.actionClearDelays],
								data: (action.output.clearDelayDeviceId ? action.output.clearDelayDeviceId : 0xFF) << 24 | this.portsToHex(action.output.clearDelayPorts)
							});

							// P5 - action delay
							await this.sendConfig({
								...options,
								inputPortIdx: inputConfig.inputPortIdx,
								configOper: ConfigOper[ConfigOper.actionDelay],
								data: action.output.delay
							});

							// P6 - action longpress
							await this.sendConfig({
								...options,
								inputPortIdx: inputConfig.inputPortIdx,
								configOper: ConfigOper[ConfigOper.actionLongpress],
								data: action.longpress
							});
						}
					} else if (Object.values(ConfigOper).filter(v => typeof v === "string").includes(configOper)){
						await this.sendConfig({
							...options,
							inputPortIdx: inputConfig.inputPortIdx,
							configOper,
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

	private async sendConfig(options: { iface: string, deviceId: number, inputPortIdx: number, configOper: string, data: number }) {
		let unsubscribe: Unsubscribe = () => {};
		await new ExtraPromise((resolve, reject) => {
			let packageId: number = this.nextPackageId(this.canAddresses.setConfig, options.deviceId);
			// Construct buffer
			let commCtrl: number = CommCtrl.empty;
			let dataCtrl: number = DataCtrl.configBit;
			let operation: number = ConfigOper.set | ConfigOper[options.configOper];

			let buf: Buffer = Buffer.alloc(8);
			buf[0] = commCtrl;
			buf[1] = dataCtrl;
			buf[2] = operation;
			buf[3] = options.inputPortIdx;
			Buffer.from([options.data >> 24, options.data >> 16, options.data >> 8, options.data]).copy(buf, 4);

			// Subscribe for ACK
			unsubscribe = this.canService.subscribe((can: Can, frame: CanFrame) => {
				let payload = this.parseFrame(frame);
				if (payload.packageId == packageId) {
					if (payload.commCtrl.isAcknowledge == true
						&& !payload.commCtrl.isError == true
						&& payload.dataCtrl.isConfig == true
						&& payload.config.isSet == true
						&& payload.config.operation == ConfigOper[options.configOper]
					) {
						resolve(payload);
					} else {
						reject(new Error("Failed to write the configuration to the device."));
					}
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
			for (let configOper of generalOper) {
				let unsubscribe: Unsubscribe = () => {};
				let configValue = await new ExtraPromise<number | ActionDto[]>((resolve, reject) => {
					let packageId: number = this.nextPackageId(this.canAddresses.getConfig, options.deviceId);
					// Construct config for each input port
					let commCtrl: number = CommCtrl.empty;
					let dataCtrl: number = DataCtrl.configBit;
					let operation: number = ConfigOper.get | configOper;
					
					let buf: Buffer = Buffer.alloc(8);
					buf[0] = commCtrl;
					buf[1] = dataCtrl;
					buf[2] = operation;
					buf[3] = inputPortIdx;

					// Config data retrived from device
					let actionData: ActionDto[] = [];
					let lastAction: ActionDto;

					unsubscribe = this.canService.subscribe((can: Can, frame: CanFrame) => { 
						let payload = this.parseFrame(frame);

						if (payload.packageId == packageId) {
							if (payload.commCtrl.isAcknowledge == true
								&& !payload.commCtrl.isError == true
								&& payload.dataCtrl.isConfig == true
								&& (payload.config.operation == configOper || actionOper.includes(payload.config.operation) && configOper == ConfigOper.actions)
							) {
								if (configOper == ConfigOper.actions) {
									console.log(payload);
									// This will indicate last action from device
									switch (payload.config.operation) {
										case ConfigOper.actions:
											// This should be last acknoweadge package
											break;
										case ConfigOper.actionPorts:
											lastAction.output.deviceId = payload.data >>> 24;
											lastAction.output.ports = this.hexToPorts(payload.data & 0xFFF);
											break;
										case ConfigOper.actionSkipWhenDelay:
											let skipWhenDelayDeviceId = payload.data >>> 24;
											lastAction.output.skipWhenDelayDeviceId = skipWhenDelayDeviceId != 0xFF ? skipWhenDelayDeviceId : null;
											lastAction.output.skipWhenDelayPorts = this.hexToPorts(payload.data & 0xFFF);
											break;
										case ConfigOper.actionClearDelays:
											let clearDelayDeviceId = payload.data >>> 24;
											lastAction.output.clearDelayDeviceId = clearDelayDeviceId != 0xFF ? clearDelayDeviceId : null;
											lastAction.output.clearDelayPorts = this.hexToPorts(payload.data & 0xFFF);
											break;
										case ConfigOper.actionDelay:
											lastAction.output.delay = payload.data;
											break;
										case ConfigOper.actionLongpress:
											lastAction.longpress = payload.data;
											break;
										case ConfigOper.actionBase:
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
									if (!payload.commCtrl.isWait) {
										resolve(actionData);
									}
								} else {
									return resolve(payload.data);
								}
							} else {
								reject(new Error("Could not retrieve the device configuration."));
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
				inputConfig[ConfigOper[configOper]] = configValue;
			}
			deviceConfig.push(inputConfig);
		}
		return deviceConfig;
	}

	public async writeEEPROM(iface: string, deviceId: number) {
		let unsubscribe: Unsubscribe = () => {};
		
		return new ExtraPromise((resolve, reject) => {
			let packageId: number = this.nextPackageId(this.canAddresses.writeEEPROM, deviceId);
			let commCtrl: number = CommCtrl.empty;
			let dataCtrl: number = DataCtrl.configBit;
			let operation: number = ConfigOper.set | ConfigOper.writeEEPROM;
			
			let buf: Buffer = Buffer.alloc(8);
			buf[0] = commCtrl;
			buf[1] = dataCtrl;
			buf[2] = operation;

			unsubscribe = this.canService.subscribe((can: Can, frame: CanFrame) => {
				let payload = this.parseFrame(frame);
				console.log(payload);
				
				if (payload.packageId == packageId) {
					if (payload.commCtrl.isAcknowledge == true
						&& !payload.commCtrl.isError == true
						&& payload.config.operation == ConfigOper.writeEEPROM
					) {
						resolve(payload.data);
					} else {
						reject(new Error("Failed to write the configuration to EEPROM."));
					}
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
			let commCtrl: number = CommCtrl.empty;
			let dataCtrl: number = DataCtrl.commandBit;
			let operation: number = CommandOper.listDelays;
			
			let delays: { id: number, deviceId: number, execute: boolean, delay: number, port:number, type: ActionType }[] = [];
			let delay: { id: number, deviceId: number, execute: boolean, delay: number, port:number, type: ActionType };
			let packageNum = 1;
			
			let buf: Buffer = Buffer.alloc(8);
			buf[0] = commCtrl;
			buf[1] = dataCtrl;
			buf[2] = operation;

			unsubscribe = this.canService.subscribe((can: Can, frame: CanFrame) => {
				let payload = this.parseFrame(frame);
				if (payload.packageId == packageId) {
					if (payload.commCtrl.isAcknowledge == true
						&& !payload.commCtrl.isError == true
						&& payload.command.operation == CommandOper.listDelays
					) {
						if (payload.commCtrl.isWait) {
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
					} else {
						reject(new Error("Could not list delays."));
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

	public async clearDelayById(iface, deviceId, delayId) {
		let unsubscribe: Unsubscribe = () => {};
		
		return new ExtraPromise((resolve, reject) => {
			let packageId: number = this.nextPackageId(this.canAddresses.clearDelay, deviceId);
			let commCtrl: number = CommCtrl.empty;
			let dataCtrl: number = DataCtrl.commandBit;
			let operation: number = CommandOper.clearDelayById;
			
			let buf: Buffer = Buffer.alloc(8);
			buf[0] = commCtrl;
			buf[1] = dataCtrl;
			buf[2] = operation;
			buf[3] = 0xFF;
			Buffer.from([delayId >> 24, delayId >> 16, delayId >> 8, delayId]).copy(buf, 4);

			unsubscribe = this.canService.subscribe((can: Can, frame: CanFrame) => {
				let payload = this.parseFrame(frame);
				if (payload.packageId == packageId) {
					if (payload.commCtrl.isAcknowledge == true
						&& !payload.commCtrl.isError == true
					) {
						resolve(payload.commCtrl.isAcknowledge);
					} else {
						reject(new Error("Failed to delete the delay."));
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

	public async clearDelayByPort(iface, deviceId, port) {
		let unsubscribe: Unsubscribe = () => {};
		
		return new ExtraPromise((resolve, reject) => {
			let packageId: number = this.nextPackageId(this.canAddresses.clearDelay, deviceId);
			let commCtrl: number = CommCtrl.empty;
			let dataCtrl: number = DataCtrl.commandBit;
			let operation: number = CommandOper.clearDelayByPort;
			
			let buf: Buffer = Buffer.alloc(8);
			buf[0] = commCtrl;
			buf[1] = dataCtrl;
			buf[2] = operation;
			buf[3] = port;

			unsubscribe = this.canService.subscribe((can: Can, frame: CanFrame) => {
				let payload = this.parseFrame(frame);
				if (payload.packageId == packageId) {
					if (payload.commCtrl.isAcknowledge == true
						&& !payload.commCtrl.isError == true
					) {
						resolve(payload.commCtrl.isAcknowledge);
					} else {
						reject(new Error("Failed to delete the delay."));
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
		let commCtrl = {
			isDiscovery: frame.data[0] & CommCtrl.discoveryBit ? true : false,
			isPing: frame.data[0] & CommCtrl.pingBit ? true : false,
			isAcknowledge: frame.data[0] & CommCtrl.acknowledgeBit ? true : false,
			isWait: frame.data[0] & CommCtrl.waitBit ? true : false,
			isError: frame.data[0] & CommCtrl.errorBit ? true : false
		};
		let dataCtrl = {
			isCommand: frame.data[1] & DataCtrl.commandBit ? true : false,
			isConfig: frame.data[1] & DataCtrl.configBit ? true : false,
			isAnalog: frame.data[1] & DataCtrl.analog ? true : false,
			isDigital: !(frame.data[1] & DataCtrl.analog) ? true : false,
			isInput: frame.data[1] & DataCtrl.input ? true : false,
			isOutput: !(frame.data[1] & DataCtrl.input) ? true : false,
			dataType: frame.data[1] & DataCtrl.dataTypeBit,
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
			commCtrl,
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