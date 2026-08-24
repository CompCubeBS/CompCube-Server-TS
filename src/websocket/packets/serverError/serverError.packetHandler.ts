import type { AuthenticatedSocket } from "../common";
import { serverErrorEvent, type ServerErrorOutput } from "./serverError.types";

/** Sends the "serverError" event for asynchronous errors that do not belong to an acknowledgement. */
export function sendServerErrorPacket(
	socket: AuthenticatedSocket,
	output: ServerErrorOutput,
): void {
	socket.emit(serverErrorEvent, output);
}
