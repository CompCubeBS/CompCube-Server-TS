import type { AuthenticatedSocket } from "../common";
import {
	cardsUpdatedEvent,
	type CardsUpdatedOutput,
} from "./cardsUpdated.types";

/** Sends the "cardsUpdated" event with the player's current map cards. */
export function sendCardsUpdatedPacket(
	socket: AuthenticatedSocket,
	output: CardsUpdatedOutput,
): void {
	socket.emit(cardsUpdatedEvent, output);
}
