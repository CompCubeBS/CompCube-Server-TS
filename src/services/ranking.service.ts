import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "../../db/db";
import { competitiveStatistics, matchParticipants, matches } from "../../db/schema";
import { ServiceError } from "./serviceError";

/** Calculates the existing-server MMR gain and loss from both player ratings. */
export function calculateMmrChange(
	winnerMmr: number,
	loserMmr: number,
	kFactor = 100,
): number {
	const expectedUpsetFactor = 1 / (1 + Math.pow(10, (winnerMmr - loserMmr) / 400));
	return Math.max(0, Math.trunc(kFactor * expectedUpsetFactor));
}

/** Returns the health-damage multiplier for a positive match round number. */
export function damageMultiplier(round: number): number {
	if (!Number.isInteger(round) || round < 1) {
		throw new Error("Round must be a positive integer");
	}
	return round <= 2 ? 1 : round * 1.5;
}

export type MatchHealthOutcome = "red" | "blue" | "draw" | null;

/** Returns a winner only after a knockout or after both players have exhausted every legal pick. */
export function resolveMatchHealthOutcome(
	redHealth: number,
	blueHealth: number,
	remainingActivePicks: number,
): MatchHealthOutcome {
	if (redHealth < 0 || blueHealth < 0 || remainingActivePicks < 0) {
		throw new Error("Health and remaining picks cannot be negative");
	}
	if (redHealth === 0 && blueHealth === 0) return "draw";
	if (redHealth === 0) return "blue";
	if (blueHealth === 0) return "red";
	if (remainingActivePicks > 0) return null;

	if (Math.abs(redHealth - blueHealth) < 0.000000001) return "draw";
	return redHealth > blueHealth ? "red" : "blue";
}

/** Returns the playback rate represented by the map's one optional speed modifier. */
export function speedModifierMultiplier(modifiers: readonly string[]): number {
	if (modifiers.includes("SS")) return 0.8;
	if (modifiers.includes("SFS")) return 1.5;
	if (modifiers.includes("FS")) return 1.2;
	return 1;
}

/** Returns Beat Saber's additive base-game score multiplier for the selected gameplay modifiers. */
export function gameplayModifierScoreMultiplier(
	modifiers: readonly string[],
	noFailTriggered = false,
): number {
	const values: Readonly<Record<string, number>> = {
		NW: -0.05,
		NB: -0.1,
		NA: -0.3,
		SS: -0.3,
		FS: 0.08,
		SFS: 0.1,
		DA: 0.07,
		GN: 0.11,
		ZM: -1,
	};
	const modifierValue = modifiers.reduce((total, modifier) => total + (values[modifier] ?? 0), 0);
	const noFailPenalty = noFailTriggered && modifiers.includes("NF") ? -0.5 : 0;
	return Math.max(0, 1 + modifierValue + noFailPenalty);
}

/** Applies the game modifier multiplier using the same floor operation as Beat Saber's score model. */
export function calculateModifiedScore(
	rawScore: number,
	modifiers: readonly string[],
	noFailTriggered = false,
): number {
	if (!Number.isInteger(rawScore) || rawScore < 0) throw new Error("Raw score must be a non-negative integer");
	return Math.floor(rawScore * gameplayModifierScoreMultiplier(modifiers, noFailTriggered));
}

/** Calculates the durable score deadline from the exact moment the start-map packet is sent. */
export function scoreSubmissionDeadline(
	startMapSentAt: Date,
	mapDurationSeconds: number,
	modifiers: readonly string[],
): Date {
	if (!Number.isFinite(mapDurationSeconds) || mapDurationSeconds <= 0) {
		throw new Error("Map duration must be positive");
	}

	const finalModifiedTime =
		mapDurationSeconds / speedModifierMultiplier(modifiers);
	const allowedSeconds = 30 + finalModifiedTime + finalModifiedTime / 2;
	return new Date(startMapSentAt.getTime() + allowedSeconds * 1000);
}

/** Calculates the 0-1 accuracy ratio. Only clients should format it as a percentage. */
export function calculateAccuracy(
	rawScore: number,
	maxScore: number,
): number {
	if (!Number.isInteger(rawScore) || rawScore < 0) {
		throw new Error("Raw score must be a non-negative integer");
	}
	if (!Number.isInteger(maxScore) || maxScore <= 0) {
		throw new Error("Max score must be a positive integer");
	}
	if (rawScore > maxScore) {
		throw new Error("Raw score cannot be greater than max score");
	}
	return rawScore / maxScore;
}

/** Applies round damage from the difference between both players' accuracy values. */
export function calculateRoundHealth(
	redAccuracy: number,
	blueAccuracy: number,
	redHealth: number,
	blueHealth: number,
	round: number,
) {
	const damage =
		Math.abs(redAccuracy - blueAccuracy) * damageMultiplier(round);
	if (redAccuracy === blueAccuracy) {
		return {
			redHealth,
			blueHealth,
			redDamage: 0,
			blueDamage: 0,
			winner: null as "red" | "blue" | null,
		};
	}
	if (redAccuracy > blueAccuracy) {
		return {
			redHealth,
			blueHealth: Math.max(0, blueHealth - damage),
			redDamage: 0,
			blueDamage: damage,
			winner: "red" as const,
		};
	}
	return {
		redHealth: Math.max(0, redHealth - damage),
		blueHealth,
		redDamage: damage,
		blueDamage: 0,
		winner: "blue" as const,
	};
}

/** Persists the winner and loser competitive statistics for a completed match. */
export async function applyMatchResult(
	seasonGuid: string,
	winnerGuid: string,
	loserGuid: string,
	mmrChange: number,
): Promise<void> {
	await db.transaction(async (tx) => {
		await tx
			.update(competitiveStatistics)
			.set({
				currentMmr: sql`GREATEST(0, ${competitiveStatistics.currentMmr} + ${mmrChange})`,
				wins: sql`${competitiveStatistics.wins} + 1`,
				totalGames: sql`${competitiveStatistics.totalGames} + 1`,
				winStreak: sql`${competitiveStatistics.winStreak} + 1`,
				bestWinStreak: sql`GREATEST(${competitiveStatistics.bestWinStreak}, ${competitiveStatistics.winStreak} + 1)`,
				updatedAt: new Date(),
			})
			.where(
				and(
					eq(competitiveStatistics.seasonGuid, seasonGuid),
					eq(competitiveStatistics.userGuid, winnerGuid),
				),
			);
		await tx
			.update(competitiveStatistics)
			.set({
				currentMmr: sql`GREATEST(0, ${competitiveStatistics.currentMmr} - ${mmrChange})`,
				totalGames: sql`${competitiveStatistics.totalGames} + 1`,
				winStreak: 0,
				updatedAt: new Date(),
			})
			.where(
				and(
					eq(competitiveStatistics.seasonGuid, seasonGuid),
					eq(competitiveStatistics.userGuid, loserGuid),
				),
			);
	});
}

/** Reverts one completed match and recomputes both players' streaks from retained match history. */
export async function revertMatchResult(matchGuid: string): Promise<void> {
	await db.transaction(async (tx) => {
		const match = await tx.query.matches.findFirst({
			where: eq(matches.guid, matchGuid),
			with: { participants: true },
		});
		if (!match || match.status !== "completed") {
			throw new ServiceError("MATCH_NOT_COMPLETED", "Only a completed match can be reverted", 409);
		}
		if (match.undone) {
			throw new ServiceError("MATCH_ALREADY_REVERTED", "This match was already reverted", 409);
		}

		await tx.update(matches).set({
			undone: true,
			updatedAt: new Date(),
		}).where(eq(matches.guid, matchGuid));
		if (!match.competitive || !match.seasonGuid) return;

		const competitors = match.participants.filter((participant) => participant.role !== "spectator");
		if (competitors.length !== 2) {
			throw new ServiceError("MATCH_RESULT_INVALID", "The match must have exactly two competitors", 409);
		}
		if (match.winnerUserGuid) {
			const winner = competitors.find((participant) => participant.userGuid === match.winnerUserGuid);
			const loser = competitors.find((participant) => participant.userGuid !== match.winnerUserGuid);
			if (!winner || !loser) {
				throw new ServiceError("MATCH_RESULT_INVALID", "Winner or loser is missing from the match", 409);
			}
			const gain = match.winnerMmrGain ?? 0;
			const loss = match.loserMmrLoss ?? gain;
			await tx.update(competitiveStatistics).set({
				currentMmr: sql`GREATEST(0, ${competitiveStatistics.currentMmr} - ${gain})`,
				wins: sql`GREATEST(0, ${competitiveStatistics.wins} - 1)`,
				totalGames: sql`GREATEST(0, ${competitiveStatistics.totalGames} - 1)`,
				updatedAt: new Date(),
			}).where(and(
				eq(competitiveStatistics.seasonGuid, match.seasonGuid),
				eq(competitiveStatistics.userGuid, winner.userGuid),
			));
			await tx.update(competitiveStatistics).set({
				currentMmr: sql`${competitiveStatistics.currentMmr} + ${loss}`,
				totalGames: sql`GREATEST(0, ${competitiveStatistics.totalGames} - 1)`,
				updatedAt: new Date(),
			}).where(and(
				eq(competitiveStatistics.seasonGuid, match.seasonGuid),
				eq(competitiveStatistics.userGuid, loser.userGuid),
			));
		} else {
			await tx.update(competitiveStatistics).set({
				totalGames: sql`GREATEST(0, ${competitiveStatistics.totalGames} - 1)`,
				updatedAt: new Date(),
			}).where(and(
				eq(competitiveStatistics.seasonGuid, match.seasonGuid),
				inArray(competitiveStatistics.userGuid, competitors.map((participant) => participant.userGuid)),
			));
		}

		for (const participant of competitors) {
			const history = await tx.query.matchParticipants.findMany({
				where: and(
					eq(matchParticipants.userGuid, participant.userGuid),
					eq(matchParticipants.role, participant.role),
				),
				with: { match: true },
			});
			const completed = history
				.map((entry) => entry.match)
				.filter((entry) =>
					entry.seasonGuid === match.seasonGuid
					&& entry.status === "completed"
					&& entry.competitive
					&& !entry.undone
				)
				.sort((a, b) => (a.endedAt?.getTime() ?? 0) - (b.endedAt?.getTime() ?? 0));
			let currentStreak = 0;
			let bestWinStreak = 0;
			for (const completedMatch of completed) {
				if (completedMatch.winnerUserGuid === participant.userGuid) {
					currentStreak += 1;
					bestWinStreak = Math.max(bestWinStreak, currentStreak);
				} else {
					currentStreak = 0;
				}
			}
			await tx.update(competitiveStatistics).set({
				winStreak: currentStreak,
				bestWinStreak,
				updatedAt: new Date(),
			}).where(and(
				eq(competitiveStatistics.seasonGuid, match.seasonGuid),
				eq(competitiveStatistics.userGuid, participant.userGuid),
			));
		}
	});
}
