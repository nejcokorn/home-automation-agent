export enum CommunicationCtrl {
	empty          = 0x00,
	discoveryBit   = 0x80,
	pingBit        = 0x40,
	acknowledgeBit = 0x20,
	errorBit       = 0x10,
	waitBit        = 0x08,
	notifyBit      = 0x04,
};

export enum DataControl {
	empty         = 0x00,
	commandBit    = 0x80,
	configBit     = 0x40,
	signalBit     = 0x20,
	directionBit  = 0x10,
	dataTypeBit   = (0x08+0x04),
	// Specific Types
	digital       = 0x00,
	analog        = 0x20,
	output        = 0x00,
	input         = 0x10,
	bit           = 0x00,
	byte          = 0x04,
	integer       = 0x08,
	decimal       = 0x0C,
};

// Command operations
export enum CommandOperations {
	empty             = 0x00,
	get               = 0x00,
	set               = 0x01,
	delay             = 0x02,
	listDelays        = 0x03,
	clearDelayById    = 0x04,
	clearDelayByPort  = 0x05,
};

// Config operations
export enum ConfigOperations {
	get                 = 0x00, // Combine get operation with the rest of the operations
	set                 = 0x80, // Combine set operation with the rest of the operations
	
	empty               = 0x00,
	debounce            = 0x01, // Debounce in microseconds
	doubleclick         = 0x02, // Double-click in milliseconds
	actions             = 0x03, // Get/Reset all actions
	actionBase          = 0x04, // Action P1 deviceId (B5), trigger (B6), mode (B7), type (B8)
	actionPorts         = 0x05, // Action P2 ports (map)
	actionSkipWhenDelay = 0x06, // Action P3 skip action if delay is present in any of the output ports (map)
	actionClearDelays   = 0x07, // Action P4 clear all delays on all specified output ports (map)
	actionDelay         = 0x08, // Action P5 delay in milliseconds
	actionLongpress     = 0x09, // Action P6 longpress in milliseconds
	bypassInstantly     = 0x0A, // Bypass Instantly
	bypassOnDIPSwitch   = 0x0B, // Bypass determined by DIP switch
	bypassOnDisconnect  = 0x0C, // Bypass on disconnect in milliseconds

	writeEEPROM         = 0x7F, // Write all configuration into EEPROM
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

export type DeviceFrame = {
	packageId: number;
	commandId: number;
	initiatorId: number;
	responderId: number;
	commControl: {
		isDiscovery: boolean;
		isPing: boolean;
		isAcknowledge: boolean;
		isWait: boolean;
		isError: boolean;
	};
	dataCtrl: {
		isCommand: boolean;
		isConfig: boolean;
		isAnalog: boolean;
		isDigital: boolean;
		isInput: boolean;
		isOutput: boolean;
		dataType: DataType;
	};
	command: {
		operation: CommandOperations
	},
	config: {
		isGet: boolean;
		isSet: boolean;
		operation: ConfigOperations;
	}
	port: number;
	data: number;
}