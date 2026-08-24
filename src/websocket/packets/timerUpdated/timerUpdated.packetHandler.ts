import type { AuthenticatedSocket } from "../common";
import {
	timerUpdatedEvent,
	type TimerUpdatedOutput,
} from "./timerUpdated.types";

/** Sends the "timerUpdated" event with the timer's durable state and remaining time. */
export function sendTimerUpdatedPacket(
	socket: AuthenticatedSocket,
	output: TimerUpdatedOutput,
): void {
	socket.emit(timerUpdatedEvent, output);
}
