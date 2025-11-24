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
	low    = 'low',
	high   = 'high',
	toggle = 'toggle',
	pwm    = 'pwm',
}

export enum ActionMode {
	click      = 'click',
	longpress   = 'longpress',
	doubleclick = 'doubleclick'
}

export enum ConfigType {
	writeEEPROM             = 0b00000000, // Write all configuration into EEPROM
	buttonRisingEdge        = 0b00000001, // Input acts as a Button on rising edge
	buttonFallingEdge       = 0b00000010, // Input acts as a Button on falling edge
	debounce                = 0b00000011, // Debounce in microseconds
	doubleclick             = 0b00000100, // Double-click in milliseconds
	actions                 = 0b00000101, // Get/Reset all actions
	actionBase              = 0b00000110, // Action P1 deviceId (B5), mode (B7), type (B8)
	actionPorts             = 0b00000111, // Action P2 ports (map)
	actionDelay             = 0b00001000, // Action P3 delay in milliseconds
	actionLongpress         = 0b00001001, // Action P4 longpress in milliseconds
	bypassInstantly         = 0b00001010, // Bypass Instantly
	bypassOnDIPSwitch       = 0b00001011, // Bypass determined by DIP switch
	bypassOnDisconnect      = 0b00001100, // Bypass on disconnect in milliseconds
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