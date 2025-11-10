export const CommControl = {
	Empty: 0x00,
	Command: 0x80,
	Discovery: 0x40,
	Ping: 0x20,
	ACK: 0x10,
	Wait: 0x08,
	Error: 0x04,
};

export const DataControl = {
	Empty: 0x00,
	Config: 0x80,
	WriteEEPROM: 0x40,
	Operation: 0x30,
	Analog: 0x08,
	Input: 0x04,
	DataType: 0x03,
};

export enum OperationType {
	Read     = 0b00, // Read = 0b00
	Write    = 0b01, // Write = 0b01
	Toggle   = 0b10, // Toggle = 0b10
	Reserved = 0b11, // Reserved = 0b11
}

export enum DataType {
	Bit = 0b00,
	Byte = 0b01,
	Int = 0b10,
	Float = 0b11,
}

export enum ConfigType {
	ButtonRisingEdge   = 0b00000,
	ButtonFallingEdge  = 0b00001,
	Switch             = 0b00010,
	ActionReset        = 0b00011,
	ActionToggle       = 0b00100,
	ActionHigh         = 0b00101,
	ActionLow          = 0b00110,
	Debounce           = 0b00111,
	Longpress          = 0b01000,
	LongpressDelayLow  = 0b01001,
	BypassInstantly    = 0b01010,
	BypassOnDIPSwitch  = 0b01011,
	BypassOnDisconnect = 0b01100
}


export type DeviceFrame = {
	to: number;
	from: number;
	commControl: {
		isCommand: boolean;
		isDiscovery: boolean;
		isPing: boolean;
		isAcknowledge: boolean;
		isWait: boolean;
		isError: boolean;
	};
	dataCtrl: {
		isConfig: boolean;
		isWriteEEPROM: boolean;
		isRead: boolean;
		isWrite: boolean;
		isToggle: boolean;
		isAnalog: boolean;
		isInput: boolean;
		dataType: DataType;
	};
	configCtrl: ConfigType;
	port: number;
	data: number;
}