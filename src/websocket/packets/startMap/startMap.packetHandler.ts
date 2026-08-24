import type { AuthenticatedSocket } from "../common";
import { startMapEvent, type StartMapOutput } from "./startMap.types";

/** Sends the exact map and durable score deadline when both clients must start playing. */
export function sendStartMapPacket(socket: AuthenticatedSocket, output: StartMapOutput): void {
	socket.emit(startMapEvent, output);
}
