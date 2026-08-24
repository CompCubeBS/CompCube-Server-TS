import type { AuthenticatedSocket } from "../common";
import {
	opponentDisconnectedEvent,
	type OpponentDisconnectedOutput,
} from "./opponentDisconnected.types";

/** Sends the "opponentDisconnected" event with the reconnect grace deadline. */
export function sendOpponentDisconnectedPacket(
	socket: AuthenticatedSocket,
	output: OpponentDisconnectedOutput,
): void {
	socket.emit(opponentDisconnectedEvent, output);
}
