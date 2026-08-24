import type { AuthenticatedSocket } from "../common";
import {
	roundResultsEvent,
	type RoundResultsOutput,
} from "./roundResults.types";

/** Sends the "roundResults" event with scores, damage and updated health. */
export function sendRoundResultsPacket(
	socket: AuthenticatedSocket,
	output: RoundResultsOutput,
): void {
	socket.emit(roundResultsEvent, output);
}
