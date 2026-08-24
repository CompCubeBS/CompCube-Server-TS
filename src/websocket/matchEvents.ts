import type { Namespace, Server } from "socket.io";
import { gameplayService, type ResolvedRound } from "../services/gameplay.service";

export interface ForfeitResult {
	winnerUserGuid: string;
	loserUserGuid: string;
	winnerMmrGain: number;
	loserMmrLoss: number;
	timeoutMinutes?: number;
}

/** Sends the terminal per-player result after a forfeit or disconnect. */
export function emitForfeitResult(
	target: Server | Namespace,
	matchGuid: string,
	result: ForfeitResult,
	reason: string,
): void {
	target.to(`user:${result.winnerUserGuid}`).emit("matchFinished", {
		matchGuid,
		result: "win",
		winnerUserGuid: result.winnerUserGuid,
		outcome: "forfeited",
		mmrChange: result.winnerMmrGain,
		reason,
	});
	target.to(`user:${result.loserUserGuid}`).emit("matchFinished", {
		matchGuid,
		result: "loss",
		winnerUserGuid: result.winnerUserGuid,
		outcome: "forfeited",
		mmrChange: -result.loserMmrLoss,
		reason,
	});
}

/** Broadcasts a persisted round result and whichever match phase follows it. */
export async function emitResolvedRound(
	target: Server | Namespace,
	result: ResolvedRound,
): Promise<void> {
	target.to(`match:${result.matchGuid}`).emit("roundResults", {
		matchGuid: result.matchGuid,
		roundGuid: result.roundGuid,
		winnerUserGuid: result.roundWinnerUserGuid,
		redHealth: result.redHealth,
		blueHealth: result.blueHealth,
		scores: result.scores,
	});

	if (result.matchResult) {
		for (const userGuid of [result.redUserGuid, result.blueUserGuid]) {
			const playerResult = result.matchResult.outcome === "draw"
				? "draw"
				: result.matchResult.winnerUserGuid === userGuid
					? "win"
					: "loss";
			target.to(`user:${userGuid}`).emit("matchFinished", {
				matchGuid: result.matchGuid,
				result: playerResult,
				winnerUserGuid: result.matchResult.winnerUserGuid,
				outcome: result.matchResult.outcome,
				mmrChange: playerResult === "loss"
					? -result.matchResult.mmrChange
					: playerResult === "win"
						? result.matchResult.mmrChange
						: 0,
				reason: result.matchResult.outcome === "draw"
					? "Health was tied after every map was played"
					: null,
			});
		}
		return;
	}

	const pick = await gameplayService.getPickState(result.matchGuid);
	target.to(`match:${result.matchGuid}`).emit("pickPhaseStarted", {
		matchGuid: result.matchGuid,
		roundNumber: pick.roundNumber,
		isOwnPick: false,
		availableMaps: [],
		damageMultiplier: pick.damageMultiplier,
		timerDueAt: pick.timerDueAt?.toISOString() ?? null,
	});
	target.to(`user:${pick.picker.userGuid}`).emit("pickPhaseStarted", {
		matchGuid: result.matchGuid,
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
		timerDueAt: pick.timerDueAt?.toISOString() ?? null,
	});
}
