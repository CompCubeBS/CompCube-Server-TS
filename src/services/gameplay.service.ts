import { and, eq, gte, inArray, notInArray, sql } from "drizzle-orm";
import { db } from "../../db/db";
import {
	competitiveStatistics,
	maps,
	matchHandMaps,
	matchHands,
	matchMapActions,
	matchParticipants,
	matchRounds,
	matchScores,
	matches,
	matchStatusHistory,
	matchTimers,
	userModerationActions,
} from "../../db/schema";
import {
	calculateMmrChange,
	calculateModifiedScore,
	calculateRoundHealth,
	damageMultiplier,
	resolveMatchHealthOutcome,
	scoreSubmissionDeadline,
} from "./ranking.service";
import { ServiceError } from "./serviceError";
import { config } from "../config";

export interface SubmittedScore {
	rawScore: number;
	modifiedScore: number;
	noFailTriggered: boolean;
	proMode: boolean;
	missCount: number;
	fullCombo: boolean;
}

/** Doubles the rolling disconnect penalty after every prior disconnect in the fourteen-day window. */
export function disconnectPenaltyMinutes(previousDisconnects: number): number {
	if (!Number.isInteger(previousDisconnects) || previousDisconnects < 0) {
		throw new Error("Previous disconnect count must be a non-negative integer");
	}
	return 15 * Math.pow(2, previousDisconnects);
}

export interface ResolvedRound {
	matchGuid: string;
	roundGuid: string;
	redUserGuid: string;
	blueUserGuid: string;
	roundWinnerUserGuid: string | null;
	redHealth: number;
	blueHealth: number;
	scores: Array<typeof matchScores.$inferSelect>;
	matchResult: null | {
		winnerUserGuid: string | null;
		outcome: "completed" | "draw";
		mmrChange: number;
	};
}

class GameplayService {
	/** Completes a match as a forfeit, optionally applying exact administrative MMR values and a timeout. */
	async forfeitMatch(
		matchGuid: string,
		loserUserGuid: string,
		actorUserGuid: string | null,
		reason: string,
		options: {
			winnerMmrGain?: number;
			loserMmrLoss?: number;
			timeoutMinutes?: number;
			disconnectPenalty?: boolean;
			outcomeKind?: "forfeited" | "admin_decision";
		} = {},
	) {
		return db.transaction(async (tx) => {
			const match = await tx.query.matches.findFirst({
				where: eq(matches.guid, matchGuid),
				with: { participants: true },
			});
			if (!match || ["completed", "aborted"].includes(match.status)) {
				throw new ServiceError("MATCH_NOT_ACTIVE", "Only an active match can be forfeited", 409);
			}
			const loser = match.participants.find((participant) =>
				participant.userGuid === loserUserGuid && participant.role !== "spectator"
			);
			const winner = match.participants.find((participant) =>
				participant.userGuid !== loserUserGuid && participant.role !== "spectator"
			);
			if (!winner || !loser) {
				throw new ServiceError("PARTICIPANT_NOT_FOUND", "The forfeiting competitor does not exist", 404);
			}
			const endedAt = new Date();
			const calculatedMmrChange = match.competitive && !match.isMock && match.seasonGuid
				? calculateMmrChange(winner.initialMmr, loser.initialMmr, match.kFactor)
				: 0;
			const winnerMmrGain = options.winnerMmrGain ?? calculatedMmrChange;
			const loserMmrLoss = options.loserMmrLoss ?? calculatedMmrChange;
			if (![winnerMmrGain, loserMmrLoss].every((value) => Number.isInteger(value) && value >= 0)) {
				throw new ServiceError("INVALID_MMR_CHANGE", "MMR changes must be non-negative integers", 400);
			}
			if (match.competitive && !match.isMock && match.seasonGuid) {
				await tx.update(competitiveStatistics).set({
					currentMmr: sql`GREATEST(0, ${competitiveStatistics.currentMmr} + ${winnerMmrGain})`,
					wins: sql`${competitiveStatistics.wins} + 1`,
					totalGames: sql`${competitiveStatistics.totalGames} + 1`,
					winStreak: sql`${competitiveStatistics.winStreak} + 1`,
					bestWinStreak: sql`GREATEST(${competitiveStatistics.bestWinStreak}, ${competitiveStatistics.winStreak} + 1)`,
					updatedAt: endedAt,
				}).where(and(
					eq(competitiveStatistics.seasonGuid, match.seasonGuid),
					eq(competitiveStatistics.userGuid, winner.userGuid),
				));
				await tx.update(competitiveStatistics).set({
					currentMmr: sql`GREATEST(0, ${competitiveStatistics.currentMmr} - ${loserMmrLoss})`,
					totalGames: sql`${competitiveStatistics.totalGames} + 1`,
					winStreak: 0,
					updatedAt: endedAt,
				}).where(and(
					eq(competitiveStatistics.seasonGuid, match.seasonGuid),
					eq(competitiveStatistics.userGuid, loser.userGuid),
				));
			}
			await tx.update(matchParticipants).set({
				active: false,
				leftAt: endedAt,
				finalMmr: sql`CASE
					WHEN ${matchParticipants.userGuid} = ${winner.userGuid} THEN ${matchParticipants.initialMmr} + ${winnerMmrGain}
					ELSE GREATEST(0, ${matchParticipants.initialMmr} - ${loserMmrLoss})
				END`,
			}).where(eq(matchParticipants.matchGuid, matchGuid));
			await tx.update(matches).set({
				status: "completed",
				outcomeKind: options.outcomeKind ?? "forfeited",
				outcomeReason: reason,
				winnerUserGuid: winner.userGuid,
				winnerMmrGain,
				loserMmrLoss,
				endedAt,
				version: match.version + 1,
				updatedAt: endedAt,
			}).where(eq(matches.guid, matchGuid));
			await tx.insert(matchStatusHistory).values({
				matchGuid,
				fromStatus: match.status,
				toStatus: "completed",
				reason,
				actorUserGuid,
				metadata: { outcome: options.outcomeKind ?? "forfeited", loserUserGuid, winnerUserGuid: winner.userGuid },
			});
			await tx.update(matchTimers).set({
				status: "cancelled",
				leaseOwner: null,
				leaseExpiresAt: null,
				updatedAt: endedAt,
			}).where(and(
				eq(matchTimers.matchGuid, matchGuid),
				inArray(matchTimers.status, ["scheduled", "paused", "processing"]),
			));
			let timeoutMinutes = options.timeoutMinutes ?? 0;
			if (options.disconnectPenalty) {
				const cutoff = new Date(endedAt.getTime() - 14 * 24 * 60 * 60 * 1000);
				const recentDisconnects = await tx.query.userModerationActions.findMany({
					columns: { guid: true },
					where: and(
						eq(userModerationActions.userGuid, loserUserGuid),
						eq(userModerationActions.action, "timeout"),
						eq(userModerationActions.disconnectPenalty, true),
						gte(userModerationActions.startsAt, cutoff),
					),
				});
				timeoutMinutes = disconnectPenaltyMinutes(recentDisconnects.length);
			}
			if (timeoutMinutes > 0) {
				await tx.insert(userModerationActions).values({
					userGuid: loserUserGuid,
					moderatorUserGuid: actorUserGuid,
					action: "timeout",
					reason: options.disconnectPenalty ? "automatic_disconnect_penalty" : reason,
					disconnectPenalty: options.disconnectPenalty === true,
					startsAt: endedAt,
					endsAt: new Date(endedAt.getTime() + timeoutMinutes * 60_000),
				});
			}
			return {
				winnerUserGuid: winner.userGuid,
				loserUserGuid,
				winnerMmrGain,
				loserMmrLoss,
				timeoutMinutes,
			};
		});
	}

	/** Returns the next picker and every active card in that player's persisted hand. */
	async getPickState(matchGuid: string) {
		const match = await db.query.matches.findFirst({
			where: eq(matches.guid, matchGuid),
		});
		if (!match || match.status !== "awaiting_pick") {
			throw new ServiceError("INVALID_MATCH_STATE", "Match is not waiting for a pick", 409);
		}
		const roundNumber = match.currentRound + 1;
		const pickerRole = roundNumber % 2 === 1 ? "red" : "blue";
		const picker = await db.query.matchParticipants.findFirst({
			where: and(
				eq(matchParticipants.matchGuid, matchGuid),
				eq(matchParticipants.role, pickerRole),
			),
		});
		if (!picker) {
			throw new ServiceError("PICKER_NOT_FOUND", "The next match picker does not exist", 409);
		}
		const hand = await db.query.matchHands.findFirst({
			where: and(
				eq(matchHands.matchGuid, matchGuid),
				eq(matchHands.userGuid, picker.userGuid),
			),
			with: {
				maps: {
					where: eq(matchHandMaps.active, true),
					orderBy: matchHandMaps.position,
					with: { map: true },
				},
			},
		});
		const timer = await db.query.matchTimers.findFirst({
			where: and(
				eq(matchTimers.matchGuid, matchGuid),
				eq(matchTimers.kind, "pick"),
				eq(matchTimers.status, "scheduled"),
			),
			orderBy: matchTimers.dueAt,
		});
		return {
			match,
			picker,
			roundNumber,
			damageMultiplier: damageMultiplier(roundNumber),
			cards: hand?.maps.map((card) => card.map) ?? [],
			timerDueAt: timer?.dueAt ?? null,
		};
	}

	/** Persists a player's initial discards and refills their hand from the match pool. */
	async discardMaps(matchGuid: string, userGuid: string, mapGuids: string[]) {
		const result = await db.transaction(async (tx) => {
			const match = await tx.query.matches.findFirst({
				where: eq(matches.guid, matchGuid),
			});
			if (!match || match.status !== "awaiting_discards" || !match.poolGuid) {
				throw new ServiceError("INVALID_MATCH_STATE", "Match is not accepting discards", 409);
			}

			const participant = await tx.query.matchParticipants.findFirst({
				where: and(
					eq(matchParticipants.matchGuid, matchGuid),
					eq(matchParticipants.userGuid, userGuid),
					eq(matchParticipants.active, true),
				),
			});
			if (!participant || participant.role === "spectator") {
				throw new ServiceError("NOT_A_PARTICIPANT", "Only a competitor can discard maps", 403);
			}

			const hand = await tx.query.matchHands.findFirst({
				where: and(eq(matchHands.matchGuid, matchGuid), eq(matchHands.userGuid, userGuid)),
			});
			if (!hand || hand.discardedAt) {
				throw new ServiceError("DISCARDS_ALREADY_SUBMITTED", "This hand has already submitted its discards", 409);
			}

			const activeCards = await tx.query.matchHandMaps.findMany({
				where: and(eq(matchHandMaps.handGuid, hand.guid), eq(matchHandMaps.active, true)),
			});
			const activeMapGuids = new Set(activeCards.map((card) => card.mapGuid));
			if (mapGuids.some((mapGuid) => !activeMapGuids.has(mapGuid))) {
				throw new ServiceError("INVALID_DISCARDS", "Every discarded map must be active in the player's hand", 400);
			}

			if (mapGuids.length) {
				await tx
					.update(matchHandMaps)
					.set({ active: false })
					.where(and(eq(matchHandMaps.handGuid, hand.guid), inArray(matchHandMaps.mapGuid, mapGuids)));
				await tx.insert(matchMapActions).values(mapGuids.map((mapGuid) => ({
					matchGuid,
					userGuid,
					mapGuid,
					action: "discarded" as const,
				})));
			}

			const historicalCards = await tx.query.matchHandMaps.findMany({
				columns: { mapGuid: true, position: true },
				where: eq(matchHandMaps.handGuid, hand.guid),
			});
			const replacementCount = mapGuids.length;
			const replacements = replacementCount
				? await tx.query.maps.findMany({
						where: and(
							eq(maps.poolGuid, match.poolGuid),
							notInArray(maps.guid, historicalCards.map((card) => card.mapGuid)),
						),
						orderBy: sql`random()`,
						limit: replacementCount,
					})
				: [];
			if (replacements.length !== replacementCount) {
				throw new ServiceError("INSUFFICIENT_MAPS", "The pool cannot refill this hand with distinct maps", 409);
			}

			const nextPosition = historicalCards.reduce((highest, card) => Math.max(highest, card.position), -1) + 1;
			if (replacements.length) {
				await tx.insert(matchHandMaps).values(replacements.map((map, index) => ({
					handGuid: hand.guid,
					mapGuid: map.guid,
					position: nextPosition + index,
				})));
				await tx.insert(matchMapActions).values(replacements.map((map) => ({
					matchGuid,
					userGuid,
					mapGuid: map.guid,
					action: "replacement" as const,
				})));
			}

			await tx.update(matchHands).set({ discardedAt: new Date() }).where(eq(matchHands.guid, hand.guid));
			const hands = await tx.query.matchHands.findMany({
				where: eq(matchHands.matchGuid, matchGuid),
			});
			const ready = hands.length === 2 && hands.every((candidate) => candidate.discardedAt || candidate.guid === hand.guid);
			let pickDueAt: Date | null = null;
			if (ready) {
				pickDueAt = new Date(Date.now() + config.pickSeconds * 1000);
				await tx.update(matches).set({
					status: "awaiting_pick",
					version: match.version + 1,
					startedAt: match.startedAt ?? new Date(),
					updatedAt: new Date(),
				}).where(eq(matches.guid, matchGuid));
				await tx.insert(matchStatusHistory).values({
					matchGuid,
					fromStatus: "awaiting_discards",
					toStatus: "awaiting_pick",
					reason: "both_players_discarded",
				});
				await tx.update(matchTimers).set({
					status: "cancelled",
					updatedAt: new Date(),
				}).where(and(
					eq(matchTimers.matchGuid, matchGuid),
					eq(matchTimers.kind, "discard"),
					inArray(matchTimers.status, ["scheduled", "processing", "paused"]),
				));
				await tx.insert(matchTimers).values({
					matchGuid,
					kind: "pick",
					dueAt: pickDueAt,
					idempotencyKey: `pick:${matchGuid}:${match.currentRound + 1}`,
					payload: { matchGuid, roundNumber: match.currentRound + 1 },
				});
			}

			const cards = await tx.query.matchHandMaps.findMany({
				where: and(eq(matchHandMaps.handGuid, hand.guid), eq(matchHandMaps.active, true)),
				with: { map: true },
			});
			return { acceptedMapGuids: mapGuids, cards: cards.map((card) => ({ handMap: card, map: card.map })), ready, pickDueAt };
		});
		return result;
	}

	/** Selects one active hand map, starts the round and schedules its durable score deadline. */
	async selectMap(matchGuid: string, userGuid: string, mapGuid: string) {
		return db.transaction(async (tx) => {
			const match = await tx.query.matches.findFirst({
				where: eq(matches.guid, matchGuid),
			});
			if (!match || match.status !== "awaiting_pick") {
				throw new ServiceError("INVALID_MATCH_STATE", "Match is not accepting a map pick", 409);
			}
			const roundNumber = match.currentRound + 1;
			const expectedRole = roundNumber % 2 === 1 ? "red" : "blue";
			const participant = await tx.query.matchParticipants.findFirst({
				where: and(
					eq(matchParticipants.matchGuid, matchGuid),
					eq(matchParticipants.userGuid, userGuid),
					eq(matchParticipants.role, expectedRole),
					eq(matchParticipants.active, true),
				),
			});
			if (!participant) {
				throw new ServiceError("NOT_YOUR_PICK", `Round ${roundNumber} belongs to the ${expectedRole} player`, 403);
			}
			const hand = await tx.query.matchHands.findFirst({
				where: and(
					eq(matchHands.matchGuid, matchGuid),
					eq(matchHands.userGuid, userGuid),
				),
				with: {
					maps: {
						where: and(
					eq(matchHandMaps.mapGuid, mapGuid),
					eq(matchHandMaps.active, true),
						),
						with: { map: true },
					},
				},
			});
			const card = hand?.maps[0];
			if (!card) {
				throw new ServiceError("MAP_NOT_IN_HAND", "The selected map is not active in the player's hand", 409);
			}

			const startedAt = new Date();
			const dueAt = scoreSubmissionDeadline(startedAt, card.map.durationSeconds, card.map.modifiers);
			const [round] = await tx.insert(matchRounds).values({
				matchGuid,
				roundNumber,
				pickerUserGuid: userGuid,
				mapGuid,
				damageMultiplier: damageMultiplier(roundNumber),
				startedAt,
				scoreSubmissionDueAt: dueAt,
			}).returning();
			await tx.update(matchHandMaps).set({ active: false }).where(and(
				eq(matchHandMaps.handGuid, hand.guid),
				eq(matchHandMaps.mapGuid, mapGuid),
			));
			await tx.insert(matchMapActions).values({
				matchGuid,
				userGuid,
				mapGuid,
				roundNumber,
				action: "picked",
			});
			await tx.update(matches).set({
				status: "awaiting_scores",
				currentRound: roundNumber,
				version: match.version + 1,
				updatedAt: startedAt,
			}).where(eq(matches.guid, matchGuid));
			await tx.insert(matchStatusHistory).values({
				matchGuid,
				fromStatus: "awaiting_pick",
				toStatus: "awaiting_scores",
				reason: "map_selected",
				actorUserGuid: userGuid,
				metadata: { roundGuid: round.guid, mapGuid, dueAt: dueAt.toISOString() },
			});
			await tx.insert(matchTimers).values({
				matchGuid,
				kind: "score_submission",
				dueAt,
				idempotencyKey: `score-submission:${round.guid}`,
				payload: { roundGuid: round.guid },
			});
			await tx.update(matchTimers).set({
				status: "cancelled",
				updatedAt: startedAt,
			}).where(and(
				eq(matchTimers.matchGuid, matchGuid),
				eq(matchTimers.kind, "pick"),
				inArray(matchTimers.status, ["scheduled", "processing", "paused"]),
			));
			return { round, map: card.map, dueAt };
		});
	}

	/** Accepts one on-time plugin score and resolves the round after both scores exist. */
	async submitScore(matchGuid: string, roundGuid: string, userGuid: string, score: SubmittedScore) {
		if (
			!Number.isInteger(score.modifiedScore) ||
			score.modifiedScore < 0 ||
			!Number.isInteger(score.rawScore) ||
			score.rawScore < 0 ||
			!Number.isInteger(score.missCount) ||
			score.missCount < 0 ||
			(score.fullCombo && score.missCount !== 0)
		) {
			throw new ServiceError("INVALID_SCORE", "Score values are inconsistent", 400);
		}
		const inserted = await db.transaction(async (tx) => {
			// Submission and timeout processing share this lock so a deadline cannot create a duplicate zero score.
			await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${roundGuid}))`);
			const round = await tx.query.matchRounds.findFirst({
				where: and(eq(matchRounds.guid, roundGuid), eq(matchRounds.matchGuid, matchGuid)),
				with: { match: true, map: true },
			});
			if (!round || !round.map || round.match.status !== "awaiting_scores" || round.endedAt) {
				throw new ServiceError("ROUND_CLOSED", "This round is no longer accepting scores", 409);
			}
			if (!round.scoreSubmissionDueAt || new Date() > round.scoreSubmissionDueAt) {
				throw new ServiceError("SCORE_DEADLINE_PASSED", "The score submission deadline has passed", 409);
			}
			if (score.rawScore > round.map.maxScore) {
				throw new ServiceError("INVALID_RAW_SCORE", "The raw score exceeds BeatSaver's maximum", 400);
			}
			const accuracy = score.rawScore / round.map.maxScore;
			const modifiedScore = calculateModifiedScore(
				score.rawScore,
				round.map.modifiers,
				score.noFailTriggered,
			);
			const participant = await tx.query.matchParticipants.findFirst({
				where: and(
					eq(matchParticipants.matchGuid, matchGuid),
					eq(matchParticipants.userGuid, userGuid),
					eq(matchParticipants.active, true),
				),
			});
			if (!participant || participant.role === "spectator") {
				throw new ServiceError("NOT_A_PARTICIPANT", "Only a competitor can submit this score", 403);
			}
			try {
				await tx.insert(matchScores).values({
					roundGuid,
					userGuid,
					rawScore: score.rawScore,
					modifiedScore,
					clientReportedModifiedScore: score.modifiedScore,
					maxScore: round.map.maxScore,
					accuracy,
					proMode: score.proMode,
					missCount: score.missCount,
					fullCombo: score.fullCombo,
					noFailTriggered: score.noFailTriggered,
					modifiers: round.map.modifiers,
					healthBefore: participant.health,
					healthAfter: participant.health,
					submittedAt: new Date(),
				});
			} catch {
				throw new ServiceError("SCORE_ALREADY_SUBMITTED", "A score already exists for this player and round", 409);
			}
			const scores = await tx.query.matchScores.findMany({
				where: eq(matchScores.roundGuid, roundGuid),
			});
			return scores.length === 2;
		});
		const round = await db.query.matchRounds.findFirst({
			columns: {},
			where: eq(matchRounds.guid, roundGuid),
			with: { map: { columns: { maxScore: true } } },
		});
		const accuracy = round?.map ? score.rawScore / round.map.maxScore : 0;
		return { accepted: true, accuracy, resolved: inserted ? await this.resolveRound(roundGuid) : null };
	}

	/** Inserts zero scores for missing players after the durable deadline and resolves the round. */
	async expireScoreDeadline(roundGuid: string): Promise<ResolvedRound | null> {
		const shouldResolve = await db.transaction(async (tx) => {
			await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${roundGuid}))`);
			const round = await tx.query.matchRounds.findFirst({
				where: eq(matchRounds.guid, roundGuid),
				with: { match: true, map: true },
			});
			if (!round || !round.map || round.endedAt || round.match.status !== "awaiting_scores") return false;
			const roundMap = round.map;
			const participants = await tx.query.matchParticipants.findMany({
				where: and(
					eq(matchParticipants.matchGuid, round.match.guid),
					inArray(matchParticipants.role, ["red", "blue"]),
				),
			});
			const existing = await tx.query.matchScores.findMany({
				where: eq(matchScores.roundGuid, roundGuid),
			});
			const existingUsers = new Set(existing.map((score) => score.userGuid));
			const missing = participants.filter((participant) => !existingUsers.has(participant.userGuid));
			if (missing.length) {
				await tx.insert(matchScores).values(missing.map((participant) => ({
					roundGuid,
					userGuid: participant.userGuid,
					rawScore: 0,
					modifiedScore: 0,
					clientReportedModifiedScore: null,
					maxScore: roundMap.maxScore,
					accuracy: 0,
					proMode: false,
					missCount: 0,
					fullCombo: false,
					noFailTriggered: false,
					modifiers: roundMap.modifiers,
					timedOut: true,
					healthBefore: participant.health,
					healthAfter: participant.health,
					submittedAt: null,
				})));
			}
			return participants.length === 2;
		});
		return shouldResolve ? this.resolveRound(roundGuid) : null;
	}

	/** Applies round damage and completes or advances the match exactly once. */
	async resolveRound(roundGuid: string): Promise<ResolvedRound | null> {
		return db.transaction(async (tx) => {
			await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${roundGuid}))`);
			const roundRow = await tx.query.matchRounds.findFirst({
				where: eq(matchRounds.guid, roundGuid),
				with: { match: true },
			});
			if (!roundRow || roundRow.endedAt) return null;
			const participants = await tx.query.matchParticipants.findMany({
				where: and(
					eq(matchParticipants.matchGuid, roundRow.match.guid),
					inArray(matchParticipants.role, ["red", "blue"]),
				),
			});
			const red = participants.find((participant) => participant.role === "red");
			const blue = participants.find((participant) => participant.role === "blue");
			const scores = await tx.query.matchScores.findMany({
				where: eq(matchScores.roundGuid, roundGuid),
			});
			const redScore = scores.find((score) => score.userGuid === red?.userGuid);
			const blueScore = scores.find((score) => score.userGuid === blue?.userGuid);
			if (!red || !blue || !redScore || !blueScore) return null;

			const health = calculateRoundHealth(
				redScore.accuracy,
				blueScore.accuracy,
				red.health,
				blue.health,
				roundRow.roundNumber,
			);
			const roundWinnerUserGuid = health.winner === "red"
				? red.userGuid
				: health.winner === "blue"
					? blue.userGuid
					: null;
			await Promise.all([
				tx.update(matchParticipants).set({ health: health.redHealth }).where(eq(matchParticipants.guid, red.guid)),
				tx.update(matchParticipants).set({ health: health.blueHealth }).where(eq(matchParticipants.guid, blue.guid)),
				tx.update(matchScores).set({
					damageTaken: health.redDamage,
					healthAfter: health.redHealth,
				}).where(eq(matchScores.guid, redScore.guid)),
				tx.update(matchScores).set({
					damageTaken: health.blueDamage,
					healthAfter: health.blueHealth,
				}).where(eq(matchScores.guid, blueScore.guid)),
			]);

			const hands = await tx.query.matchHands.findMany({
				columns: { guid: true },
				where: eq(matchHands.matchGuid, roundRow.match.guid),
				with: {
					maps: {
						columns: { mapGuid: true },
						where: eq(matchHandMaps.active, true),
					},
				},
			});
			const remaining = hands.reduce((total, hand) => total + hand.maps.length, 0);
			const outcome = resolveMatchHealthOutcome(health.redHealth, health.blueHealth, remaining);
			const endedAt = new Date();
			await tx.update(matchRounds).set({
				winnerUserGuid: roundWinnerUserGuid,
				endedAt,
			}).where(eq(matchRounds.guid, roundGuid));

			let matchResult: ResolvedRound["matchResult"] = null;
			if (!outcome) {
				const pickDueAt = new Date(endedAt.getTime() + config.pickSeconds * 1000);
				await tx.update(matches).set({
					status: "awaiting_pick",
					version: roundRow.match.version + 1,
					updatedAt: endedAt,
				}).where(eq(matches.guid, roundRow.match.guid));
				await tx.insert(matchStatusHistory).values({
					matchGuid: roundRow.match.guid,
					fromStatus: "awaiting_scores",
					toStatus: "awaiting_pick",
					reason: "round_resolved",
					metadata: { roundGuid },
				});
				await tx.insert(matchTimers).values({
					matchGuid: roundRow.match.guid,
					kind: "pick",
					dueAt: pickDueAt,
					idempotencyKey: `pick:${roundRow.match.guid}:${roundRow.roundNumber + 1}`,
					payload: { matchGuid: roundRow.match.guid, roundNumber: roundRow.roundNumber + 1 },
				});
			} else {
				const winner = outcome === "red" ? red : outcome === "blue" ? blue : null;
				const loser = outcome === "red" ? blue : outcome === "blue" ? red : null;
				let mmrChange = 0;
				if (winner && loser && roundRow.match.competitive !== false && roundRow.match.seasonGuid) {
					mmrChange = calculateMmrChange(winner.initialMmr, loser.initialMmr, roundRow.match.kFactor);
					await tx.update(competitiveStatistics).set({
						currentMmr: sql`GREATEST(0, ${competitiveStatistics.currentMmr} + ${mmrChange})`,
						wins: sql`${competitiveStatistics.wins} + 1`,
						totalGames: sql`${competitiveStatistics.totalGames} + 1`,
						winStreak: sql`${competitiveStatistics.winStreak} + 1`,
						bestWinStreak: sql`GREATEST(${competitiveStatistics.bestWinStreak}, ${competitiveStatistics.winStreak} + 1)`,
						updatedAt: endedAt,
					}).where(and(
						eq(competitiveStatistics.seasonGuid, roundRow.match.seasonGuid),
						eq(competitiveStatistics.userGuid, winner.userGuid),
					));
					await tx.update(competitiveStatistics).set({
						currentMmr: sql`GREATEST(0, ${competitiveStatistics.currentMmr} - ${mmrChange})`,
						totalGames: sql`${competitiveStatistics.totalGames} + 1`,
						winStreak: 0,
						updatedAt: endedAt,
					}).where(and(
						eq(competitiveStatistics.seasonGuid, roundRow.match.seasonGuid),
						eq(competitiveStatistics.userGuid, loser.userGuid),
					));
				} else if (roundRow.match.competitive !== false && roundRow.match.seasonGuid) {
					// A draw counts as a played game for both competitors, but neither player gains MMR or a win.
					await tx.update(competitiveStatistics).set({
						totalGames: sql`${competitiveStatistics.totalGames} + 1`,
						winStreak: 0,
						updatedAt: endedAt,
					}).where(and(
						eq(competitiveStatistics.seasonGuid, roundRow.match.seasonGuid),
						inArray(competitiveStatistics.userGuid, [red.userGuid, blue.userGuid]),
					));
				}
				if (winner && loser) {
					await tx.update(matchParticipants).set({
						active: false,
						leftAt: endedAt,
						finalMmr: sql`CASE
							WHEN ${matchParticipants.userGuid} = ${winner.userGuid} THEN ${matchParticipants.initialMmr} + ${mmrChange}
							WHEN ${matchParticipants.userGuid} = ${loser.userGuid} THEN GREATEST(0, ${matchParticipants.initialMmr} - ${mmrChange})
							ELSE ${matchParticipants.initialMmr}
						END`,
					}).where(eq(matchParticipants.matchGuid, roundRow.match.guid));
				} else {
					await tx.update(matchParticipants).set({
						active: false,
						leftAt: endedAt,
						finalMmr: matchParticipants.initialMmr,
					}).where(eq(matchParticipants.matchGuid, roundRow.match.guid));
				}
				await tx.update(matches).set({
					status: "completed",
					outcomeKind: outcome === "draw" ? "draw" : "completed",
					outcomeReason: outcome === "draw" ? "health_tied_after_map_exhaustion" : "knockout_or_health_after_map_exhaustion",
					winnerUserGuid: winner?.userGuid ?? null,
					winnerMmrGain: mmrChange,
					loserMmrLoss: mmrChange,
					endedAt,
					version: roundRow.match.version + 1,
					updatedAt: endedAt,
				}).where(eq(matches.guid, roundRow.match.guid));
				await tx.insert(matchStatusHistory).values({
					matchGuid: roundRow.match.guid,
					fromStatus: "awaiting_scores",
					toStatus: "completed",
					reason: outcome === "draw" ? "draw_after_map_exhaustion" : "winner_resolved",
					metadata: { roundGuid, winnerUserGuid: winner?.userGuid ?? null },
				});
				await tx.update(matchTimers).set({
					status: "cancelled",
					leaseOwner: null,
					leaseExpiresAt: null,
					updatedAt: endedAt,
				}).where(and(
					eq(matchTimers.matchGuid, roundRow.match.guid),
					inArray(matchTimers.status, ["scheduled", "paused", "processing"]),
				));
				matchResult = {
					winnerUserGuid: winner?.userGuid ?? null,
					outcome: outcome === "draw" ? "draw" : "completed",
					mmrChange,
				};
			}

			const updatedScores = await tx.query.matchScores.findMany({
				where: eq(matchScores.roundGuid, roundGuid),
			});
			return {
				matchGuid: roundRow.match.guid,
				roundGuid,
				redUserGuid: red.userGuid,
				blueUserGuid: blue.userGuid,
				roundWinnerUserGuid,
				redHealth: health.redHealth,
				blueHealth: health.blueHealth,
				scores: updatedScores,
				matchResult,
			};
		});
	}
}

export const gameplayService = new GameplayService();
