import type { AuthenticatedSocket } from "../common";
import { matchPausedEvent, type MatchPausedOutput } from "./matchPaused.types";

/** Sends the "matchPaused" event when match progression is suspended. */
export function sendMatchPausedPacket(
	socket: AuthenticatedSocket,
	output: MatchPausedOutput,
): void {
	socket.emit(matchPausedEvent, output);
}
