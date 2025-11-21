import { Injectable, OnModuleInit, OnModuleDestroy } from "@nestjs/common";
import { Can, CanFrame } from "src/can/can.types";
import { CommControl, DataControl, ConfigControl, ConfigType, DeviceFrame, ActionType, ActionMode } from "src/device/device.types";
import { LoggerExtra } from "src/extras/logger.extra";
import { ExtraPromise } from "src/extras/promise.extra";
import { CanService } from "src/can/can.service";
import { DeviceConfigDto, ActionDto } from "./device.dto";

type Unsubscribe = () => void;

// Gropu of general configurations
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
export class DeviceService {
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
		EEPROM: 60000, // Long operation - timeout after 1 min (usually between 30 sec and 1 min)
		listDelays: 1000
	}

	canAddresses = {
		getPort: 0xF0,
		setPort: 0xF1,
		discover: 0xF2,
		ping: 0xF3,
		getConfig: 0xF4,
		setConfig: 0xF5,
		writeEEPROM: 0xF6,
		listDelays: 0xF7,
		broadcast: 0x0FF,
	}

	constructor(
		private readonly canService: CanService
	) {}

	public async getPort(optinos: { iface: string, deviceId: number, signalType: string, direction: string, portId: number }) {
		let unsubscribe: Unsubscribe = () => {};
		
		return await new ExtraPromise((resolve, reject) => {
			let buf : Buffer = Buffer.alloc(8);
			let commControl : number = CommControl.commandBit;
			let dataCtrl : number = (optinos.signalType == DataControl[DataControl.analog] ? DataControl.analog : DataControl.digital) | (optinos.direction == DataControl[DataControl.input] ? DataControl.input : DataControl.output)
			buf[0] = this.canAddresses.getPort;
			buf[1] = commControl;
			buf[2] = dataCtrl;
			buf[3] = optinos.portId;

			unsubscribe = this.canService.subscribe((can: Can, frame: CanFrame) => {
				let payload = this.parseFrame(frame);
				if (payload.to == this.canAddresses.getPort
					&& payload.commControl.isCommand == true
					&& payload.commControl.isAcknowledge == true
					&& payload.dataCtrl.isSet == false
					&& payload.port == optinos.portId
				) {
					resolve(payload.data);
				}
			});
			
			this.canService.send(optinos.iface, {
				id: optinos.deviceId,
				data: buf
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
			let commControl : number = CommControl.commandBit | (options.extra !== undefined || options.delay > 0 ? CommControl.waitBit : CommControl.empty);
			let dataCtrl : number =
				DataControl.set
				| (options.signalType == DataControl[DataControl.analog] ? DataControl.analog : DataControl.digital)
				| (options.direction == DataControl[DataControl.input] ? DataControl.input : DataControl.output)
				| DataControl.integer;
			buf[0] = this.canAddresses.setPort;
			buf[1] = commControl;
			buf[2] = dataCtrl;
			buf[3] = options.portId;
			Buffer.from([data >> 24, data >> 16, data >> 8, data]).copy(buf, 4);

			unsubscribe = this.canService.subscribe((can: Can, frame: CanFrame) => {
				let payload = this.parseFrame(frame);
				if (payload.to == this.canAddresses.setPort
					&& payload.commControl.isCommand == true
					&& payload.commControl.isAcknowledge == true
					&& (payload.dataCtrl.isSet == true)
					&& payload.port == options.portId
				) {
					resolve(payload.data);
				}
			});
			
			this.canService.send(options.iface, {
				id: options.deviceId,
				data: buf
			});

			if (options.extra !== undefined) {
				commControl = CommControl.commandBit | (options.delay > 0 ? CommControl.waitBit : CommControl.empty);
				dataCtrl =
					DataControl.set
					| (options.signalType == DataControl[DataControl.analog] ? DataControl.analog : DataControl.digital)
					| (options.direction == DataControl[DataControl.input] ? DataControl.input : DataControl.output)
					| DataControl.extra
					| DataControl.integer;
				buf[1] = commControl;
				buf[2] = dataCtrl;
				Buffer.from([options.extra >> 24, options.extra >> 16, options.extra >> 8, options.extra]).copy(buf, 4);
				this.canService.send(options.iface, {
					id: options.deviceId,
					data: buf
				});
			}
			
			if (options.delay > 0) {
				commControl = CommControl.commandBit;
				dataCtrl =
					DataControl.set
					| (options.signalType == DataControl[DataControl.analog] ? DataControl.analog : DataControl.digital)
					| (options.direction == DataControl[DataControl.input] ? DataControl.input : DataControl.output)
					| DataControl.delay
					| DataControl.integer;
				buf[1] = commControl;
				buf[2] = dataCtrl;
				Buffer.from([options.delay >> 24, options.delay >> 16, options.delay >> 8, options.delay]).copy(buf, 4);
				this.canService.send(options.iface, {
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
			unsubscribe = this.canService.subscribe((can: Can, frame: CanFrame) => {
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

			this.canService.send(options.iface, {
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
			unsubscribe = this.canService.subscribe((can: Can, frame: CanFrame) => {
				let payload = this.parseFrame(frame);
				if (payload.to == this.canAddresses.discover
					&& payload.commControl.isCommand == true
					&& payload.commControl.isDiscovery == true
					&& payload.commControl.isAcknowledge == true
				) {
					deviceList.push(payload.from);
				}
			});

			this.canService.send(options.iface, {
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
			for (const inputConfig of options.config) {

				// Loop through the actions
				for (const configType in inputConfig) {
					const value = inputConfig[configType];

					if (configType == ConfigType[ConfigType.actions]) {
						// Remove all actions before inserting new set of actions
						await this.sendConfig({
							...options,
							inputPortIdx: inputConfig.inputPortIdx,
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
								...options,
								inputPortIdx: inputConfig.inputPortIdx,
								configType: configType,
								data: data
							});

							// Only send delay if not equal 0
							if (action.delay != 0) {
								await this.sendConfig({
									...options,
									inputPortIdx: inputConfig.inputPortIdx,
									configType: ConfigType[ConfigType.delay],
									data: action.delay
								});
							}
						}
					} else {
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
			// Construct buffer
			let commControl: number = CommControl.commandBit;
			let configCtrl: number =  ConfigControl.configBit | ConfigControl.set | ConfigType[options.configType];
			let buf: Buffer = Buffer.alloc(8);
			buf[0] = this.canAddresses.setConfig;
			buf[1] = commControl;
			buf[2] = configCtrl;
			buf[3] = options.inputPortIdx;
			Buffer.from([options.data >> 16, options.data >> 8, options.data]).copy(buf, 5);

			// Subscribe for ACK
			unsubscribe = this.canService.subscribe((can: Can, frame: CanFrame) => {
				let payload = this.parseFrame(frame);
				if (
					payload.to == this.canAddresses.setConfig &&
					payload.from == options.deviceId &&
					payload.commControl.isCommand == true &&
					payload.commControl.isAcknowledge == true &&
					payload.configCtrl.isConfig == true &&
					payload.configCtrl.isSet == true &&
					payload.configCtrl.option == ConfigType[options.configType]
				) {
					resolve(payload);
				}
			});

			// Send data
			this.canService.send(options.iface, {
				id: options.deviceId,
				data: buf
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
					// Construct config for each input port
					let commControl : number = CommControl.commandBit;
					let configCtrl : number = ConfigControl.configBit | ConfigControl.get | config;
					let buf : Buffer = Buffer.alloc(8);
					buf[0] = this.canAddresses.getConfig;
					buf[1] = commControl;
					buf[2] = configCtrl;
					buf[3] = inputPortIdx;

					// Config data retrived from device
					let actionData: ActionDto[] = [];
					let lastAction: ActionDto;

					unsubscribe = this.canService.subscribe((can: Can, frame: CanFrame) => { 
						let payload = this.parseFrame(frame);
						if (payload.to == this.canAddresses.getConfig
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

					this.canService.send(options.iface, {
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
		
		return new ExtraPromise((resolve, reject) => {
			let buf : Buffer = Buffer.alloc(8);
			let commControl : number = CommControl.commandBit;
			let configCtrl : number = ConfigControl.configBit | ConfigControl.set;
			buf[0] = this.canAddresses.writeEEPROM;
			buf[1] = commControl;
			buf[2] = configCtrl;

			unsubscribe = this.canService.subscribe((can: Can, frame: CanFrame) => {
				let payload = this.parseFrame(frame);
				if (payload.to == this.canAddresses.writeEEPROM
					&& payload.commControl.isCommand == true
					&& payload.commControl.isAcknowledge == true
					&& payload.configCtrl.isSet == true
					&& payload.configCtrl.option == ConfigType.writeEEPROM
				) {
					resolve(payload.data);
				}
			});
			
			this.canService.send(iface, {
				id: deviceId,
				data: buf
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
			let buf : Buffer = Buffer.alloc(8);
			let commControl : number = CommControl.commandBit;
			let dataCtrl : number = DataControl.listDelays;
			let delays: { deviceId: number, delay: number, port:number, type: ActionType }[] = [];
			let delay: { deviceId: number, delay: number, port:number, type: ActionType };
			buf[0] = this.canAddresses.listDelays;
			buf[1] = commControl;
			buf[2] = dataCtrl;

			unsubscribe = this.canService.subscribe((can: Can, frame: CanFrame) => {
				let payload = this.parseFrame(frame);
				if (payload.to == this.canAddresses.listDelays
					&& payload.commControl.isAcknowledge == true
					&& payload.dataCtrl.isListDelays == true
				) {
					if (payload.commControl.isWait) {
						if (payload.port != 0xFF) {
							delay = {
								deviceId: (payload.data & 0xFF000000) >> 24,
								port: payload.port,
								type: (payload.data & 0xFF) == 0 ? ActionType.LOW : (payload.data & 0xFF) == 1 ? ActionType.HIGH : ActionType.TOGGLE,
								delay: 0,
							}
						} else {
							delay.delay = payload.data
							delays.push(delay);
						}

					} else {
						resolve(delays);
					}
				}
			});
			
			this.canService.send(iface, {
				id: deviceId,
				data: buf
			});
		})
		.timeout(this.timeout.listDelays)
		.finally(() => {
			unsubscribe();
		});
	}

	parseFrame(frame: CanFrame): DeviceFrame {
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
			isGet : (frame.data[2] & DataControl.operationBits) == DataControl.get ? true : false,
			isSet : (frame.data[2] & DataControl.operationBits) == DataControl.set ? true : false,
			isListDelays : (frame.data[2] & DataControl.operationBits) == DataControl.listDelays ? true : false,
			isAnalog : frame.data[2] & DataControl.analog ? true : false,
			isDigital : !(frame.data[2] & DataControl.analog) ? true : false,
			isInput : frame.data[2] & DataControl.input ? true : false,
			isOutput : !(frame.data[2] & DataControl.input) ? true : false,
			dataType : frame.data[2] & DataControl.dataTypeBits,
		};
		let configCtrl = {
			isConfig : frame.data[2] & ConfigControl.configBit ? true : false,
			isGet : frame.data[2] & ConfigControl.operationBit ? false : true,
			isSet : frame.data[2] & ConfigControl.operationBit ? true : false,
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