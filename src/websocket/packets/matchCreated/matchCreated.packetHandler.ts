import type { AuthenticatedSocket } from "../common";
import {
	matchCreatedEvent,
	type MatchCreatedOutput,
} from "./matchCreated.types";

/** Sends the "matchCreated" event when two queued players are matched. */
export function sendMatchCreatedPacket(
	socket: AuthenticatedSocket,
	output: MatchCreatedOutput,
): void {
	socket.emit(matchCreatedEvent, output);
}
