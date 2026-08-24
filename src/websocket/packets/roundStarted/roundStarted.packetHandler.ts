import type { AuthenticatedSocket } from "../common";
import {
	roundStartedEvent,
	type RoundStartedOutput,
} from "./roundStarted.types";

/** Sends the "roundStarted" event with the persisted round identifier and start time. */
export function sendRoundStartedPacket(
	socket: AuthenticatedSocket,
	output: RoundStartedOutput,
): void {
	socket.emit(roundStartedEvent, output);
}
