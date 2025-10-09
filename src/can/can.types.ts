export type RxFrame = {
	id: number;
	data: Buffer;
	ext?: boolean;
	rtr?: boolean;
	ts_sec?: number;
	ts_usec?: number;
};

export type TxFrameInput = {
	iface: string; // cilj: npr. "can0"
	id: number;
	data?: number[]; // alternativa dataHex
	ext?: boolean;
	rtr?: boolean;
};

export type CanInterface = {
	iface: string;
	rxCount: number;
	txCount: number;
};
