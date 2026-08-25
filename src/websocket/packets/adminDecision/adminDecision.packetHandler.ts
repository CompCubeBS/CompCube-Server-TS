import { and, eq } from "drizzle-orm";
import { db } from "../../../../db/db";
import { matchParticipants, matches } from "../../../../db/schema";
import { gameplayService } from "../../../services/gameplay.service";
import { matchService } from "../../../services/match.service";
import { emitForfeitResult } from "../../matchEvents";
import { ServiceError } from "../../../services/serviceError";
import {
	acknowledged,
	type Ack,
	type AuthenticatedSocket,
} from "../common";
import {
	adminDecisionEvent,
	type AdminDecisionInput,
	type AdminDecisionOutput,
} from "./adminDecision.types";

/** Registers the moderator-only "adminDecision" match override request. */
export function registerAdminDecisionPacket(socket: AuthenticatedSocket): void {
	socket.on(
		adminDecisionEvent,
		(input: AdminDecisionInput, ack: Ack<AdminDecisionOutput>) =>
			void acknowledged(ack, async () => {
				if (
					!socket.data.user.permissions.some((permission) =>
						["role:admin", "role:moderator", "role:dev"].includes(
							permission,
						),
					)
				) {
					throw new ServiceError(
						"FORBIDDEN",
						"A moderator is required",
						403,
					);
				}

				if (!input?.matchGuid || !input.reason?.trim()) {
					throw new ServiceError("INVALID_DECISION", "matchGuid and reason are required", 400);
				}
				if (input.action === "force_pick") {
					const mapGuid = input.payload?.mapGuid;
					if (!input.targetUserGuid || typeof mapGuid !== "string") {
						throw new ServiceError("INVALID_DECISION", "force_pick requires targetUserGuid and payload.mapGuid", 400);
					}
					await gameplayService.selectMap(input.matchGuid, input.targetUserGuid, mapGuid, { source: "server" });
				} else if (input.action === "force_score") {
					const payload = input.payload;
					if (!input.targetUserGuid || typeof payload?.roundGuid !== "string") {
						throw new ServiceError("INVALID_DECISION", "force_score requires targetUserGuid and score payload", 400);
					}
					await gameplayService.submitScore(
						input.matchGuid,
						payload.roundGuid,
						input.targetUserGuid,
						{
							rawScore: Number(payload.rawScore),
							modifiedScore: Number(payload.modifiedScore),
							noFailTriggered: payload.noFailTriggered === true,
							proMode: payload.proMode === true,
							missCount: Number(payload.missCount),
							fullCombo: payload.fullCombo === true,
						},
						{ source: "server" },
					);
				} else if (input.action === "set_health") {
					const health = input.payload?.health;
					if (!input.targetUserGuid || typeof health !== "number" || health < 0) {
						throw new ServiceError("INVALID_DECISION", "set_health requires targetUserGuid and a non-negative payload.health", 400);
					}
					const updated = await db.update(matchParticipants).set({ health }).where(and(
						eq(matchParticipants.matchGuid, input.matchGuid),
						eq(matchParticipants.userGuid, input.targetUserGuid),
					)).returning({ guid: matchParticipants.guid });
					if (!updated.length) throw new ServiceError("PARTICIPANT_NOT_FOUND", "Match participant does not exist", 404);
				} else if (input.action === "abort") {
					await matchService.transition(input.matchGuid, "aborted", {
						reason: input.reason,
						actorUserGuid: socket.data.user.guid,
					});
					await db.update(matches).set({
						outcomeKind: "admin_decision",
						outcomeReason: input.reason,
					}).where(eq(matches.guid, input.matchGuid));
				} else if (input.action === "forfeit") {
					if (!input.targetUserGuid) {
						throw new ServiceError("INVALID_DECISION", "forfeit requires targetUserGuid", 400);
					}
					const result = await gameplayService.forfeitMatch(
						input.matchGuid,
						input.targetUserGuid,
						socket.data.user.guid,
						input.reason,
					);
					emitForfeitResult(socket.nsp, input.matchGuid, result, input.reason);
				} else if (input.action === "declare_winner") {
					if (!socket.data.user.permissions.some((permission) => ["role:admin", "role:dev"].includes(permission))) {
						throw new ServiceError("FORBIDDEN", "An administrator is required to declare a winner", 403);
					}
					if (!input.targetUserGuid) {
						throw new ServiceError("INVALID_DECISION", "declare_winner requires the winner as targetUserGuid", 400);
					}
					const competitors = await db.query.matchParticipants.findMany({
						where: and(
							eq(matchParticipants.matchGuid, input.matchGuid),
							eq(matchParticipants.active, true),
						),
					});
					const loser = competitors.find((participant) =>
						participant.role !== "spectator" && participant.userGuid !== input.targetUserGuid
					);
					if (!loser || !competitors.some((participant) => participant.userGuid === input.targetUserGuid)) {
						throw new ServiceError("INVALID_WINNER", "Winner must be an active competitor", 400);
					}
					const winnerMmrGain = input.payload?.winnerMmrGain;
					const loserMmrLoss = input.payload?.loserMmrLoss;
					const result = await gameplayService.forfeitMatch(
						input.matchGuid,
						loser.userGuid,
						socket.data.user.guid,
						input.reason,
						{
							winnerMmrGain: winnerMmrGain === undefined ? undefined : Number(winnerMmrGain),
							loserMmrLoss: loserMmrLoss === undefined ? undefined : Number(loserMmrLoss),
							outcomeKind: "admin_decision",
						},
					);
					emitForfeitResult(socket.nsp, input.matchGuid, result, input.reason);
				} else {
					throw new ServiceError("INVALID_DECISION", "Unknown administrative action", 400);
				}
				return { accepted: true };
			}),
	);
}
