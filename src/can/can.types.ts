export type Interface = {
	iface: string;
	rxCount: number;
	txCount: number;
};

export type Can = {
	channel: any;
	iface: Interface;
};

export type CanFrame = {
	id: number;
	data: Buffer;
	ext?: boolean;
	rtr?: boolean;
};

export const CommControl = {
	Empty: 0x00,
	Command: 0x80,
	Discovery: 0x40,
	Ping: 0x20,
	ACK: 0x10,
	Error: 0x08,
};