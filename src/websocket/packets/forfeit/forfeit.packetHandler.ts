import { and, eq } from "drizzle-orm";
import { db } from "../../../../db/db";
import { matchParticipants, matches } from "../../../../db/schema";
import { gameplayService } from "../../../services/gameplay.service";
import { ServiceError } from "../../../services/serviceError";
import { emitForfeitResult } from "../../matchEvents";
import { acknowledged, type Ack, type AuthenticatedSocket } from "../common";
import { forfeitEvent, type ForfeitInput, type ForfeitOutput } from "./forfeit.types";

/** Registers a voluntary forfeit outside active map play and applies the rolling disconnect timeout. */
export function registerForfeitPacket(socket: AuthenticatedSocket): void {
	socket.on(forfeitEvent, (input: ForfeitInput, ack: Ack<ForfeitOutput>) =>
		void acknowledged(ack, async () => {
			const match = await db.query.matches.findFirst({
				where: eq(matches.guid, input?.matchGuid),
			});
			if (!match || ["completed", "aborted"].includes(match.status)) {
				throw new ServiceError("MATCH_NOT_ACTIVE", "Only an active match can be forfeited", 409);
			}
			if (["countdown", "playing", "awaiting_scores"].includes(match.status)) {
				throw new ServiceError("MAP_IN_PROGRESS", "A match cannot be forfeited while a map is in progress", 409);
			}
			const participant = await db.query.matchParticipants.findFirst({
				where: and(
					eq(matchParticipants.matchGuid, match.guid),
					eq(matchParticipants.userGuid, socket.data.user.guid),
					eq(matchParticipants.active, true),
				),
			});
			if (!participant || participant.role === "spectator") {
				throw new ServiceError("NOT_A_PARTICIPANT", "Only a competitor can forfeit", 403);
			}
			const reason = input.reason?.trim() || "player_forfeited";
			const result = await gameplayService.forfeitMatch(
				match.guid,
				socket.data.user.guid,
				socket.data.user.guid,
				reason,
				{ disconnectPenalty: true },
			);
			emitForfeitResult(socket.nsp, match.guid, result, reason);
			return result;
		}),
	);
}
