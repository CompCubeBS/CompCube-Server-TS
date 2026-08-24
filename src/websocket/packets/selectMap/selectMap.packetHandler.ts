import { gameplayService } from "../../../services/gameplay.service";
import {
	acknowledged,
	type Ack,
	type AuthenticatedSocket,
} from "../common";
import {
	selectMapEvent,
	type SelectMapInput,
	type SelectMapOutput,
} from "./selectMap.types";

/** Registers a map pick, starts the persisted round and broadcasts its score deadline. */
export function registerSelectMapPacket(socket: AuthenticatedSocket): void {
	socket.on(
		selectMapEvent,
		(input: SelectMapInput, ack: Ack<SelectMapOutput>) =>
			void acknowledged(ack, async () => {
				const result = await gameplayService.selectMap(
					input.matchGuid,
					socket.data.user.guid,
					input.mapGuid,
				);
				const map = {
					guid: result.map.guid,
					hash: result.map.hash,
					characteristic: result.map.characteristic,
					difficulty: result.map.difficulty,
					modifiers: result.map.modifiers,
					durationSeconds: result.map.durationSeconds,
					maxScore: result.map.maxScore,
				};
				socket.nsp.to(`match:${input.matchGuid}`).emit("playerSelectedMap", {
					matchGuid: input.matchGuid,
					roundNumber: result.round.roundNumber,
					pickerUserGuid: socket.data.user.guid,
					map,
				});
				socket.nsp.to(`match:${input.matchGuid}`).emit("roundStarted", {
					matchGuid: input.matchGuid,
					roundGuid: result.round.guid,
					roundNumber: result.round.roundNumber,
					startsAt: result.round.startedAt.toISOString(),
				});
				socket.nsp.to(`match:${input.matchGuid}`).emit("startMap", {
					matchGuid: input.matchGuid,
					roundGuid: result.round.guid,
					map,
					scoreDueAt: result.dueAt.toISOString(),
				});
				return {
					roundGuid: result.round.guid,
					mapGuid: result.map.guid,
					scoreDueAt: result.dueAt.toISOString(),
				};
			}),
	);
}
