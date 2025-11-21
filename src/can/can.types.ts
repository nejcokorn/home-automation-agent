export type Interface = {
	name: string;
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