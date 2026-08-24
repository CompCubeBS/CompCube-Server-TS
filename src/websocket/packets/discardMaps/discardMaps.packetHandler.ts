import { ServiceError } from "../../../services/serviceError";
import { gameplayService } from "../../../services/gameplay.service";
import {
	acknowledged,
	type Ack,
	type AuthenticatedSocket,
} from "../common";
import {
	discardMapsEvent,
	type DiscardMapsInput,
	type DiscardMapsOutput,
} from "./discardMaps.types";
import { sendCardsUpdatedPacket } from "../cardsUpdated/cardsUpdated.packetHandler";

/** Registers the "discardMaps" request and validates the submitted map selection. */
export function registerDiscardMapsPacket(socket: AuthenticatedSocket): void {
	socket.on(
		discardMapsEvent,
		(input: DiscardMapsInput, ack: Ack<DiscardMapsOutput>) =>
			void acknowledged(ack, async () => {
				if (
					!input?.matchGuid ||
					!Array.isArray(input.mapGuids) ||
					input.mapGuids.length > 2 ||
					new Set(input.mapGuids).size !== input.mapGuids.length
				) {
					throw new ServiceError(
						"INVALID_DISCARDS",
						"Submit zero to two distinct map GUIDs",
					);
				}

				const result = await gameplayService.discardMaps(
					input.matchGuid,
					socket.data.user.guid,
					input.mapGuids,
				);
				sendCardsUpdatedPacket(socket, {
					matchGuid: input.matchGuid,
					maps: result.cards.map(({ map }) => ({
						guid: map.guid,
						hash: map.hash,
						characteristic: map.characteristic,
						difficulty: map.difficulty,
						modifiers: map.modifiers,
						durationSeconds: map.durationSeconds,
						maxScore: map.maxScore,
					})),
				});
				if (result.ready) {
					const pick = await gameplayService.getPickState(input.matchGuid);
					socket.nsp.to(`match:${input.matchGuid}`).emit("pickPhaseStarted", {
						matchGuid: input.matchGuid,
						roundNumber: pick.roundNumber,
						isOwnPick: false,
						availableMaps: [],
						damageMultiplier: pick.damageMultiplier,
						timerDueAt: result.pickDueAt?.toISOString() ?? null,
					});
					const pickerSockets = await socket.nsp.in(`user:${pick.picker.userGuid}`).fetchSockets();
					for (const pickerSocket of pickerSockets) {
						pickerSocket.emit("pickPhaseStarted", {
							matchGuid: input.matchGuid,
							roundNumber: pick.roundNumber,
							isOwnPick: true,
							availableMaps: pick.cards.map((map) => ({
								guid: map.guid,
								hash: map.hash,
								characteristic: map.characteristic,
								difficulty: map.difficulty,
								modifiers: map.modifiers,
								durationSeconds: map.durationSeconds,
								maxScore: map.maxScore,
							})),
							damageMultiplier: pick.damageMultiplier,
							timerDueAt: result.pickDueAt?.toISOString() ?? null,
						});
					}
				}
				return { acceptedMapGuids: result.acceptedMapGuids };
			}),
	);
}
