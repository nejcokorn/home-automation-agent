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

// Action types
export enum ActionTrigger {
	disabled     = 'disabled',
	rising       = 'rising',
	falling      = 'falling',
}

export enum ActionType {
	low          = 'low',
	high         = 'high',
	toggle       = 'toggle',
	pwm          = 'pwm',
}

export enum ActionMode {
	click       = 'click',
	longpress   = 'longpress',
	doubleclick = 'doubleclick',
}

export enum ConfigType {
	writeEEPROM         = 0x00, // Write all configuration into EEPROM
	debounce            = 0x01, // Debounce in microseconds
	doubleclick         = 0x02, // Double-click in milliseconds
	actions             = 0x03, // Get/Reset all actions
	actionBase          = 0x04, // Action P1 deviceId (B5), trigger (B6), mode (B7), type (B8)
	actionPorts         = 0x05, // Action P2 ports (map)
	actionSkipWhenDelay = 0x06, // Action P3 skip action if delay is present in any of the output ports (map)
	actionClearDelay    = 0x07, // Action P4 clear all delays on all specified output ports (map)
	actionDelay         = 0x08, // Action P5 delay in milliseconds
	actionLongpress     = 0x09, // Action P6 longpress in milliseconds
	bypassInstantly     = 0x0A, // Bypass Instantly
	bypassOnDIPSwitch   = 0x0B, // Bypass determined by DIP switch
	bypassOnDisconnect  = 0x0C, // Bypass on disconnect in milliseconds
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