import { Body, Controller, Delete, Get, Param, Post } from "@nestjs/common";
import { CanService } from "./can.service";
import { CanFrame } from "./can.types";

@Controller("can")
export class CanController {
	constructor(private readonly can: CanService) {}

	@Get()
	list() {
		return this.can.listInterfaces();
	}

	@Post(":iface/tx")
	sendToIface(
		@Param("iface") iface: string,
		@Body() body: Omit<CanFrame, "iface">,
	) {
		this.can.send(iface, body);
		return { ok: true };
	}
}
