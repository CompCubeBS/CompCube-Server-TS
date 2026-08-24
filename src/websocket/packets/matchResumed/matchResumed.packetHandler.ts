import type { AuthenticatedSocket } from "../common";
import {
	matchResumedEvent,
	type MatchResumedOutput,
} from "./matchResumed.types";

/** Sends the "matchResumed" event when match progression continues. */
export function sendMatchResumedPacket(
	socket: AuthenticatedSocket,
	output: MatchResumedOutput,
): void {
	socket.emit(matchResumedEvent, output);
}
