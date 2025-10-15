export const CommControl = {
	Empty: 0x00,
	Command: 0x80,
	Discovery: 0x40,
	Ping: 0x20,
	ACK: 0x10,
	Error: 0x08,
};

export const DataControl = {
	Empty: 0x00,
	Config: 0x80,
	WriteEEPROM: 0x40,
	Write: 0x20,
	Input: 0x10,
	DataType: 0x0c,
};

export enum DataType {
	Bit = 0b00,
	Byte = 0b01,
	Int = 0b10,
	Float = 0b11,
}

export enum ConfigType {
	ButtonRisingEdge = 0b00000,
	ButtonFallingEdge = 0b00001,
	Switch = 0b00010,
	ActionToggle = 0b00011,
	ActionHigh = 0b00100,
	ActionLow = 0b00101,
	Debounce = 0b00110,
	Longpress = 0b00111,
	LongpressDelayOff = 0b01000,
	BypassInstantly = 0b01001,
	BypassOnDIPSwitch = 0b01010,
	BypassOnDisconnect = 0b01011,
	Reset = 0b11111,
}


export type DeviceFrame = {
	to: number;
	from: number;
	commControl: {
		isCommand: boolean;
		isDiscovery: boolean;
		isPing: boolean;
		isAcknowledge: boolean;
		isError: boolean;
	};
	dataCtrl: {
		isConfig: boolean;
		isWriteEEPROM: boolean;
		isWrite: boolean;
		isInput: boolean;
		dataType: DataType;
	};
	configCtrl: ConfigType;
	port: number;
	data: number;
}