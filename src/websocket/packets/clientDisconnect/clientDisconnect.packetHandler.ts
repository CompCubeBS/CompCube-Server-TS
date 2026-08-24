import { and, eq } from "drizzle-orm";
import { db } from "../../../../db/db";
import { matchParticipants } from "../../../../db/schema";
import { gameplayService } from "../../../services/gameplay.service";
import { queueService } from "../../../services/queue.service";
import { emitForfeitResult } from "../../matchEvents";
import { acknowledged, type Ack, type AuthenticatedSocket } from "../common";
import {
	clientDisconnectEvent,
	type ClientDisconnectOutput,
} from "./clientDisconnect.types";

/** Ends an active match as a normal-MMR forfeit and applies the rolling disconnect timeout. */
export async function forfeitDisconnectedPlayer(socket: AuthenticatedSocket) {
	const participant = await db.query.matchParticipants.findFirst({
		where: and(
			eq(matchParticipants.userGuid, socket.data.user.guid),
			eq(matchParticipants.active, true),
		),
		with: { match: true },
	});
	if (!participant || participant.role === "spectator") return null;

	const reason = "player_disconnected";
	const result = await gameplayService.forfeitMatch(
		participant.matchGuid,
		socket.data.user.guid,
		null,
		reason,
		{ disconnectPenalty: true },
	);
	emitForfeitResult(socket.nsp, participant.matchGuid, result, reason);
	return participant.matchGuid;
}

/** Registers the plugin's explicit disconnect notice and removes a queue entry or forfeits an active match. */
export function registerClientDisconnectPacket(socket: AuthenticatedSocket): void {
	socket.on(
		clientDisconnectEvent,
		(_input: unknown, ack: Ack<ClientDisconnectOutput>) =>
			void acknowledged(ack, async () => {
				const removedFromQueue = await queueService.leave(socket.data.user.guid);
				const forfeitedMatchGuid = await forfeitDisconnectedPlayer(socket);
				return { removedFromQueue, forfeitedMatchGuid };
			}),
	);
}
