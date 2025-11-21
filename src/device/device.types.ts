export enum CommControl {
	empty          = 0x00,
	commandBit     = 0x80,
	discoveryBit   = 0x40,
	pingBit        = 0x20,
	acknowledgeBit = 0x10,
	waitBit        = 0x08,
	errorBit       = 0x04,
};

export enum DataControl {
	empty         = 0x00,
	operationBits = 0x70,
	signalBit     = 0x08,
	directionBit  = 0x04,
	dataTypeBits  = 0x03,
	// Specific Types
	get           = 0x00,
	set           = 0x10,
	extra         = 0x20,
	delay         = 0x30,
	listDelays    = 0x40,
	digital       = 0x00,
	analog        = 0x08,
	input         = 0x04,
	output        = 0x00,
	bit           = 0x00,
	byte          = 0x01,
	integer       = 0x02,
	decimal       = 0x03,
};

export enum ConfigControl {
	empty        = 0x00,
	configBit    = 0x80,
	operationBit = 0x40,
	optionBits   = 0x3F,
	// Specific Types
	get          = 0x00,
	set          = 0x40,
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
	TOGGLE = 'toggle',
	PWM    = 'pwm',
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
		isGet: boolean;
		isSet: boolean;
		isListDelays: boolean;
		isAnalog: boolean;
		isDigital: boolean;
		isInput: boolean;
		isOutput: boolean;
		dataType: DataType;
	};
	configCtrl: {
		isConfig: boolean;
		isGet: boolean;
		isSet: boolean;
		option: ConfigType;
	}
	port: number;
	data: number;
}