import { and, eq } from "drizzle-orm";
import { db } from "../../db/db";
import { matches, matchStatusHistory, type Match } from "../../db/schema";
import { ServiceError } from "./serviceError";
import { timerService } from "./timer.service";

type MatchStatus = Match["status"];

const allowedTransitions: Record<MatchStatus, readonly MatchStatus[]> = {
	waiting_players: ["awaiting_discards", "paused", "aborted"],
	awaiting_discards: ["awaiting_pick", "paused", "completed", "aborted"],
	awaiting_pick: ["countdown", "paused", "completed", "aborted"],
	countdown: ["playing", "paused", "completed", "aborted"],
	playing: ["awaiting_scores", "paused", "completed", "aborted"],
	awaiting_scores: ["round_results", "paused", "completed", "aborted"],
	round_results: ["awaiting_pick", "paused", "completed", "aborted"],
	paused: [
		"waiting_players",
		"awaiting_discards",
		"awaiting_pick",
		"countdown",
		"playing",
		"awaiting_scores",
		"round_results",
		"completed",
		"aborted",
	],
	completed: [],
	aborted: [],
};

class MatchService {
	/** Atomically validates, persists and audits a match status transition. */
	async transition(
		matchGuid: string,
		toStatus: MatchStatus,
		options: {
			expectedVersion?: number;
			reason?: string;
			actorUserGuid?: string;
			metadata?: Record<string, unknown>;
		} = {},
	): Promise<Match> {
		return db.transaction(async (tx) => {
			const current = await tx.query.matches.findFirst({
				where: eq(matches.guid, matchGuid),
			});
			if (!current) {
				throw new ServiceError(
					"MATCH_NOT_FOUND",
					"Match does not exist",
					404,
				);
			}

			if (options.expectedVersion !== undefined && current.version !== options.expectedVersion) {
                throw new ServiceError(
					"STALE_MATCH",
					"Match state changed; refresh and retry",
					409,
				);
            }

			if (!allowedTransitions[current.status].includes(toStatus)) {
				throw new ServiceError(
					"INVALID_MATCH_TRANSITION",
					`Cannot move a match from ${current.status} to ${toStatus}`,
					409,
				);
            }
			const terminal = toStatus === "completed" || toStatus === "aborted";
			const [updated] = await tx
				.update(matches)
				.set({
					status: toStatus,
					version: current.version + 1,
					endedAt: terminal ? new Date() : null,
					updatedAt: new Date(),
				})
				.where(
					and(
						eq(matches.guid, matchGuid),
						eq(matches.version, current.version),
					),
				)
				.returning();
			if (!updated) {
				throw new ServiceError(
					"STALE_MATCH",
					"Match state changed; refresh and retry",
					409,
				);
			}
			await tx
				.insert(matchStatusHistory)
				.values({
					matchGuid,
					fromStatus: current.status,
					toStatus,
					reason: options.reason,
					actorUserGuid: options.actorUserGuid,
					metadata: options.metadata ?? {},
				});
			return updated;
		});
	}

	/** Pauses an active match and all of its durable timers. */
	async pause(matchGuid: string, actorUserGuid?: string): Promise<Match> {
		const match = await db.query.matches.findFirst({
			where: eq(matches.guid, matchGuid),
		});
		if (
			!match ||
			match.status === "completed" ||
			match.status === "aborted"
		) {
			throw new ServiceError(
				"MATCH_NOT_PAUSABLE",
				"Match cannot be paused",
				409,
			);
		}
		await db
			.update(matches)
			.set({ statusBeforePause: match.status })
			.where(eq(matches.guid, matchGuid));
		const updated = await this.transition(matchGuid, "paused", {
			expectedVersion: match.version,
			reason: "admin_pause",
			actorUserGuid,
		});
		await timerService.pauseMatch(matchGuid);
		return updated;
	}

	/** Restores a paused match and resumes its durable timers. */
	async resume(matchGuid: string, actorUserGuid?: string): Promise<Match> {
		const match = await db.query.matches.findFirst({
			where: eq(matches.guid, matchGuid),
		});
		if (!match || match.status !== "paused" || !match.statusBeforePause) {
			throw new ServiceError(
				"MATCH_NOT_PAUSED",
				"Match is not paused",
				409,
			);
		}
		const updated = await this.transition(
			matchGuid,
			match.statusBeforePause,
			{
				expectedVersion: match.version,
				reason: "admin_resume",
				actorUserGuid,
			},
		);
		await db
			.update(matches)
			.set({ statusBeforePause: null })
			.where(eq(matches.guid, matchGuid));
		await timerService.resumeMatch(matchGuid);
		return updated;
	}
}

export const matchService = new MatchService();
