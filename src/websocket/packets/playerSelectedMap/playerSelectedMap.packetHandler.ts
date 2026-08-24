import type { AuthenticatedSocket } from "../common";
import {
	playerSelectedMapEvent,
	type PlayerSelectedMapOutput,
} from "./playerSelectedMap.types";

/** Sends the "playerSelectedMap" event after a round map is chosen. */
export function sendPlayerSelectedMapPacket(
	socket: AuthenticatedSocket,
	output: PlayerSelectedMapOutput,
): void {
	socket.emit(playerSelectedMapEvent, output);
}
