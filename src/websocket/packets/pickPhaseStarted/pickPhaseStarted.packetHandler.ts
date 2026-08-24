import type { AuthenticatedSocket } from "../common";
import {
	pickPhaseStartedEvent,
	type PickPhaseStartedOutput,
} from "./pickPhaseStarted.types";

/** Sends the "pickPhaseStarted" event with the available maps and timer. */
export function sendPickPhaseStartedPacket(
	socket: AuthenticatedSocket,
	output: PickPhaseStartedOutput,
): void {
	socket.emit(pickPhaseStartedEvent, output);
}
