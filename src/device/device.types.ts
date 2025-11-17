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
	Operation: 0x70,
	Analog: 0x08,
	Input: 0x04,
	DataType: 0x03,
	// Type specific
	TypeRead: 0x00,
	TypeWrite: 0x10,
	TypeToggle: 0x20,
};

export const ConfigControl = {
	Empty: 0x00,
	Config: 0x80,
	Operation: 0x40,
	Options: 0x3F,
	// Type specific
	TypeWrite: 0x40,
	TypeRead: 0x00,
};

export enum DataType {
	Bit   = 0b00,
	Byte  = 0b01,
	Int   = 0b10,
	Float = 0b11,
}

export enum ActionType {
	LOW    = 'low',
	HIGH   = 'high',
	TOGGLE = 'toggle'
}

export enum ActionMode {
	NORMAL      = 'normal',
	LONGPRESS   = 'longpress',
	DOUBLECLICK = 'doubleclick'
}

export enum ConfigType {
	writeEEPROM        = 0b00000,
	buttonRisingEdge   = 0b00001,
	buttonFallingEdge  = 0b00010,
	switch             = 0b00011,
	debounce           = 0b00100,
	longpress          = 0b00101,
	doubleclick        = 0b00110,
	delay              = 0b00111,
	actions            = 0b01000,
	actionToggle       = 0b01001,
	actionHigh         = 0b01010,
	actionLow          = 0b01011,
	actionLongToggle   = 0b01100,
	actionLongHigh     = 0b01101,
	actionLongLow      = 0b01110,
	actionDoubleToggle = 0b01111,
	actionDoubleHigh   = 0b10000,
	actionDoubleLow    = 0b10001,
	bypassInstantly    = 0b10010,
	bypassOnDIPSwitch  = 0b10011,
	bypassOnDisconnect = 0b10100
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
		isRead: boolean;
		isWrite: boolean;
		isToggle: boolean;
		isAnalog: boolean;
		isInput: boolean;
		dataType: DataType;
	};
	configCtrl: {
		isConfig: boolean;
		isRead: boolean;
		isWrite: boolean;
		option: ConfigType;
	}
	port: number;
	data: number;
}