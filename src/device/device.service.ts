import { Injectable, OnModuleInit, OnModuleDestroy } from "@nestjs/common";
import { CanFrame } from "src/can/can.types";
import { CommControl, DataControl, ConfigControl, ConfigType, DataType, DeviceFrame, ActionType, ActionMode } from "src/device/device.types";
import { LoggerExtra } from "src/extras/logger.extra";
import { ExtraPromise } from "src/extras/promise.extra";
import { CanService } from "src/can/can.service";
import { DeviceConfigDto, ActionDto } from "./device.dto";

type Unsubscribe = () => void;

// Gropu of general configuratino to read from
const generalConfigs = [
	ConfigType.buttonRisingEdge,
	ConfigType.buttonFallingEdge,
	ConfigType.switch,
	ConfigType.debounce,
	ConfigType.longpress,
	ConfigType.doubleclick,
	ConfigType.actions,
	ConfigType.bypassInstantly,
	ConfigType.bypassOnDIPSwitch,
	ConfigType.bypassOnDisconnect,
]

// Group of action configurations
const actionConfigs = [
	ConfigType.delay,
	ConfigType.actionToggle,
	ConfigType.actionHigh,
	ConfigType.actionLow,
	ConfigType.actionLongToggle,
	ConfigType.actionLongHigh,
	ConfigType.actionLongLow,
	ConfigType.actionDoubleToggle,
	ConfigType.actionDoubleHigh,
	ConfigType.actionDoubleLow
]

@Injectable()
export class DeviceService implements OnModuleInit, OnModuleDestroy {
	private readonly logger = new LoggerExtra(DeviceService.name);

	private unsubscribeEvents: Unsubscribe = () => {};
	private listeners = new Set<(event: DeviceFrame) => void>();
	private timeout = {
		command: 10,
		config: 5000,
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
			let commControl : number = CommControl.commandBit;
			let dataCtrl : number = (optinos.signalType == DataControl[DataControl.analog] ? DataControl.analog : DataControl.digital) | (optinos.direction == DataControl[DataControl.input] ? DataControl.input : DataControl.output)
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

	public async writePort(options: { iface: string, deviceId: number, signalType: string, direction: string, portId: number, type: ActionType, delay: number, extra: number }) {
		let unsubscribe: Unsubscribe = () => {};
		
		return await new ExtraPromise((resolve, reject) => {
			let data: any;
			switch (options.type) {
				case ActionType.LOW:
					data = 0;
					break;
				case ActionType.HIGH:
					data = 1;
					break;
				case ActionType.TOGGLE:
					data = 2;
					break;
				case ActionType.PWM:
					data = 3;
					break;
			}
			let buf : Buffer = Buffer.alloc(8);
			let commControl : number = CommControl.commandBit | (options.extra > 0 || options.delay > 0 ? CommControl.waitBit : CommControl.empty);
			let dataCtrl : number =
				DataControl.write
				| (options.signalType == DataControl[DataControl.analog] ? DataControl.analog : DataControl.digital)
				| (options.direction == DataControl[DataControl.input] ? DataControl.input : DataControl.output)
				| DataControl.integer;
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
					&& (payload.dataCtrl.isWrite == true)
					&& payload.port == options.portId
				) {
					resolve(payload.data);
				}
			});
			
			this.can.send(options.iface, {
				id: options.deviceId,
				data: buf
			});

			if (options.extra) {
				commControl = CommControl.commandBit | (options.delay > 0 ? CommControl.waitBit : CommControl.empty);
				buf[1] = commControl;
				Buffer.from([options.extra >> 24, options.extra >> 16, options.extra >> 8, options.extra]).copy(buf, 4);
				this.can.send(options.iface, {
					id: options.deviceId,
					data: buf
				});
			}
			if (options.delay) {
				commControl = CommControl.commandBit;
				buf[1] = commControl;
				Buffer.from([options.delay >> 24, options.delay >> 16, options.delay >> 8, options.delay]).copy(buf, 4);
				this.can.send(options.iface, {
					id: options.deviceId,
					data: buf
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
			let deviceList: number[] = [];
			let buf : Buffer = Buffer.alloc(8);
			let commControl : number = CommControl.commandBit | CommControl.pingBit;
			let dataCtrl : number = DataControl.empty;
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
			let commControl : number = CommControl.commandBit | CommControl.discoveryBit;
			let dataCtrl : number = DataControl.empty;
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

					if (configType == ConfigType[ConfigType.actions]) {
						// Remove all actions before inserting new set of actions
						await this.sendConfig({
							...options, idxPort,
							configType: ConfigType[ConfigType.actions], 
							data: 0
						});

						// Loop thorugh set of actions
						for (const action of inputConfig[configType]) {
							let data = action.deviceId << 16 | this.portsToHex(action.ports);
							let configType;
							switch (action.mode) {
								case ActionMode.NORMAL:
									switch (action.type) {
										case ActionType.LOW: configType = ConfigType[ConfigType.actionLow]; break;
										case ActionType.HIGH: configType = ConfigType[ConfigType.actionHigh]; break;
										case ActionType.TOGGLE: configType = ConfigType[ConfigType.actionToggle]; break;
									}
									break;
								case ActionMode.LONGPRESS:
									switch (action.type) {
										case ActionType.LOW: configType = ConfigType[ConfigType.actionLongLow]; break;
										case ActionType.HIGH: configType = ConfigType[ConfigType.actionLongHigh]; break;
										case ActionType.TOGGLE: configType = ConfigType[ConfigType.actionLongToggle]; break;
									}
									break;
								case ActionMode.DOUBLECLICK:
									switch (action.type) {
										case ActionType.LOW: configType = ConfigType[ConfigType.actionDoubleLow]; break;
										case ActionType.HIGH: configType = ConfigType[ConfigType.actionDoubleHigh]; break;
										case ActionType.TOGGLE: configType = ConfigType[ConfigType.actionDoubleToggle]; break;
									}
									break;
							}
							await this.sendConfig({
								...options, idxPort,
								configType: configType,
								data: data
							});

							// Only send delay if not equal 0
							if (action.delay != 0) {
								await this.sendConfig({
									...options, idxPort,
									configType: ConfigType[ConfigType.delay],
									data: action.delay
								});
							}
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
			let commControl: number = CommControl.commandBit;
			let configCtrl: number =  ConfigControl.configBit | ConfigControl.write | ConfigType[options.configType];
			let buf: Buffer = Buffer.alloc(8);
			buf[0] = this.canAddresses.writeConfig;
			buf[1] = commControl;
			buf[2] = configCtrl;
			buf[3] = options.idxPort;
			Buffer.from([options.data >> 16, options.data >> 8, options.data]).copy(buf, 5);

			// Subscribe for ACK
			unsubscribe = this.can.subscribe((frame: CanFrame) => {
				let payload = this.parseFrame(frame);
				if (
					payload.to == this.canAddresses.writeConfig &&
					payload.from == options.deviceId &&
					payload.commControl.isCommand == true &&
					payload.commControl.isAcknowledge == true &&
					payload.configCtrl.isConfig == true &&
					payload.configCtrl.isWrite == true &&
					payload.configCtrl.option == ConfigType[options.configType]
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
		// Initialize configuration object
		let deviceConfig: any = [];
		
		for (let idxPort = 0; idxPort < 16; idxPort++) {
			let inputConfig = {};
			for (let config of generalConfigs) {
				let unsubscribe: Unsubscribe = () => {};
				let configValue = await new ExtraPromise<number | ActionDto[]>((resolve, reject) => {
					// Construct config for each input port
					let commControl : number = CommControl.commandBit;
					let configCtrl : number = ConfigControl.configBit | ConfigControl.read | config;
					let buf : Buffer = Buffer.alloc(8);
					buf[0] = this.canAddresses.readConfig;
					buf[1] = commControl;
					buf[2] = configCtrl;
					buf[3] = idxPort;

					// Config data retrived from device
					let actionData: ActionDto[] = [];
					let lastAction: ActionDto;

					unsubscribe = this.can.subscribe((frame: CanFrame) => { 
						let payload = this.parseFrame(frame);
						if (payload.to == this.canAddresses.readConfig
							&& payload.commControl.isCommand == true
							&& payload.commControl.isAcknowledge == true
							&& payload.configCtrl.isConfig == true
							&& (payload.configCtrl.option == config || actionConfigs.includes(payload.configCtrl.option) && config == ConfigType.actions)
						) {
							if (config == ConfigType.actions) {
								// This will indicate last action from device
								if (payload.configCtrl.option == ConfigType.actions) {
									// Another check indicating no more actions
									if (!payload.commControl.isWait) {
										resolve(actionData);
									}
								} else if(payload.configCtrl.option == ConfigType.delay) {
									lastAction.delay = payload.data;
									console.log(lastAction, payload.data);
									
									if (!payload.commControl.isWait) {
										resolve(actionData);
									}
								} else {
									let type;
									let mode;
									switch (payload.configCtrl.option) {
										case ConfigType.actionLow:          mode = ActionMode.NORMAL;      type = ActionType.LOW; break;
										case ConfigType.actionHigh:         mode = ActionMode.NORMAL;      type = ActionType.HIGH; break;
										case ConfigType.actionToggle:       mode = ActionMode.NORMAL;      type = ActionType.TOGGLE; break;
										case ConfigType.actionLongLow:      mode = ActionMode.LONGPRESS;   type = ActionType.LOW; break;
										case ConfigType.actionLongHigh:     mode = ActionMode.LONGPRESS;   type = ActionType.HIGH; break;
										case ConfigType.actionLongToggle:   mode = ActionMode.LONGPRESS;   type = ActionType.TOGGLE; break;
										case ConfigType.actionDoubleLow:    mode = ActionMode.DOUBLECLICK; type = ActionType.LOW; break;
										case ConfigType.actionDoubleHigh:   mode = ActionMode.DOUBLECLICK; type = ActionType.HIGH; break;
										case ConfigType.actionDoubleToggle: mode = ActionMode.DOUBLECLICK; type = ActionType.TOGGLE; break;
									}

									let deviceId = payload.data >> 16;
									if (deviceId != 0xFF) {
										lastAction = {
											deviceId,
											mode,
											type,
											ports: this.hexToPorts(payload.data & 0xFFFF),
											delay: 0
										}
										actionData.push(lastAction);
									}
								}
							} else {
								return resolve(payload.data);
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
				// Set configuration parameter
				inputConfig[ConfigType[config]] = configValue;
			}
			deviceConfig.push(inputConfig);
		}
		return deviceConfig;
	}

	public async writeEEPROM(iface: string, deviceId: number) {
		let unsubscribe: Unsubscribe = () => {};
		
		await new ExtraPromise((resolve, reject) => {
			let buf : Buffer = Buffer.alloc(8);
			let commControl : number = CommControl.commandBit;
			let configCtrl : number = ConfigControl.configBit | ConfigControl.write;
			buf[0] = this.canAddresses.writeEEPROM;
			buf[1] = commControl;
			buf[2] = configCtrl;

			unsubscribe = this.can.subscribe((frame: CanFrame) => {
				let payload = this.parseFrame(frame);
				if (payload.to == this.canAddresses.writeEEPROM
					&& payload.commControl.isCommand == true
					&& payload.commControl.isAcknowledge == true
					&& payload.configCtrl.isWrite == true
					&& payload.configCtrl.option == ConfigType.writeEEPROM
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
		let to = frame.id;
		let from = frame.data[0];
		let commControl = {
			isCommand: frame.data[1] & CommControl.commandBit ? true : false,
			isDiscovery: frame.data[1] & CommControl.discoveryBit ? true : false,
			isPing: frame.data[1] & CommControl.pingBit ? true : false,
			isAcknowledge: frame.data[1] & CommControl.acknowledgeBit ? true : false,
			isWait: frame.data[1] & CommControl.waitBit ? true : false,
			isError: frame.data[1] & CommControl.errorBit ? true : false
		};
		let dataCtrl = {
			isRead : (frame.data[2] & DataControl.operationBits) == DataControl.read ? true : false,
			isWrite : (frame.data[2] & DataControl.operationBits) == DataControl.write ? true : false,
			isAnalog : frame.data[2] & DataControl.analog ? true : false,
			isDigital : !(frame.data[2] & DataControl.analog) ? true : false,
			isInput : frame.data[2] & DataControl.input ? true : false,
			isOutput : !(frame.data[2] & DataControl.input) ? true : false,
			dataType : frame.data[2] & DataControl.dataTypeBits,
		};
		let configCtrl = {
			isConfig : frame.data[2] & ConfigControl.configBit ? true : false,
			isRead : frame.data[2] & ConfigControl.operationBit ? false : true,
			isWrite : frame.data[2] & ConfigControl.operationBit ? true : false,
			option : frame.data[2] & ConfigControl.optionBits
		};
		let port = frame.data[3];
		let data = (frame.data[4] << 24) |
				(frame.data[5] << 16) |
				(frame.data[6] << 8) |
				frame.data[7];
		
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