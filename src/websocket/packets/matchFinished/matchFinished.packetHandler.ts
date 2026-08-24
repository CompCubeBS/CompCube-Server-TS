import type { AuthenticatedSocket } from "../common";
import {
	matchFinishedEvent,
	type MatchFinishedOutput,
} from "./matchFinished.types";

/** Sends the "matchFinished" event with the final outcome and MMR change. */
export function sendMatchFinishedPacket(
	socket: AuthenticatedSocket,
	output: MatchFinishedOutput,
): void {
	socket.emit(matchFinishedEvent, output);
}
