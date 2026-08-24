import { queueService } from "../../../services/queue.service";
import { ServiceError } from "../../../services/serviceError";
import { acknowledged, type Ack, type AuthenticatedSocket } from "../common";
import {
	joinQueueEvent,
	type JoinQueueInput,
	type JoinQueueOutput,
} from "./joinQueue.types";

/** Registers the "joinQueue" request and returns queue details or a service error acknowledgement. */
export function registerJoinQueuePacket(socket: AuthenticatedSocket): void {
	socket.on(
		joinQueueEvent,
		(input: JoinQueueInput, ack: Ack<JoinQueueOutput>) =>
			void acknowledged(ack, async () => {
				if (!input?.queue || input.queue.length > 80) {
					throw new ServiceError(
						"INVALID_QUEUE",
						"queue must be a non-empty slug",
					);
				}

				const result = await queueService.join(
					socket.data.user.guid,
					input.queue,
				);
				if (result.createdMatch) {
					const { match, red, blue, redMaps, blueMaps, discardDueAt } = result.createdMatch;
					for (const player of [
						{ participant: red, opponent: blue, maps: redMaps },
						{ participant: blue, opponent: red, maps: blueMaps },
					]) {
						const room = `user:${player.participant.user.guid}`;
						socket.nsp.in(room).socketsJoin(`match:${match.guid}`);
						socket.nsp.to(room).emit("matchCreated", {
							matchGuid: match.guid,
							red: {
								guid: red.user.guid,
								platformId: red.user.platformId!,
								username: red.user.username,
								avatarUrl: red.user.avatarUrl,
							},
							blue: {
								guid: blue.user.guid,
								platformId: blue.user.platformId!,
								username: blue.user.username,
								avatarUrl: blue.user.avatarUrl,
							},
							initialMaps: player.maps.map((map) => ({
								guid: map.guid,
								hash: map.hash,
								characteristic: map.characteristic,
								difficulty: map.difficulty,
								modifiers: map.modifiers,
								durationSeconds: map.durationSeconds,
								maxScore: map.maxScore,
							})),
							timerDueAt: discardDueAt.toISOString(),
						});
					}
				}
				return {
					queueGuid: result.queue.guid,
					joinedAt: result.entry.joinedAt.toISOString(),
					mmr: result.mmr,
					matched: Boolean(result.createdMatch),
					matchGuid: result.createdMatch?.match.guid ?? null,
				};
			}),
	);
}
