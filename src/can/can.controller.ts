import { Body, Controller, Delete, Get, Param, Post } from "@nestjs/common";
import { CanService } from "./can.service";
import { TxFrameInput } from "./can.types";

@Controller("can")
export class CanController {
	constructor(private readonly can: CanService) {}

	@Get()
	list() {
		return this.can.list();
	}

	@Post(":iface/tx")
	sendToIface(
		@Param("iface") iface: string,
		@Body() body: Omit<TxFrameInput, "iface">,
	) {
		this.can.sendFrame({ iface, ...body });
		return { ok: true };
	}
}
