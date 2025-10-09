// import { WebSocketGateway, WebSocketServer } from "@nestjs/websockets";
// import { Server } from "socket.io";
// import { CanService } from "./can.service";

// @WebSocketGateway({
// 	cors: { origin: "*" },
// })
// export class CanGateway {
// 	@WebSocketServer() server: Server;

// 	constructor(private readonly can: CanService) {
// 		// prijavi broadcast bridge
// 		this.can.registerWsBroadcast((msg) => {
// 			this.server.emit("can_frame", {
// 				id: msg.id,
// 				ext: !!msg.ext,
// 				rtr: !!msg.rtr,
// 				dataHex: msg.data?.toString("hex") ?? "",
// 			});
// 		});
// 	}
// }
