import { and, asc, eq, gt, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { db } from "../../db/db";
import {
	competitiveStatistics,
	maps,
	matchHandMaps,
	matchHands,
	matchAuditEvents,
	matchMapActions,
	matchParticipants,
	matches,
	matchStatusHistory,
	matchTimers,
	queuedPlayers,
	queues,
	seasons,
	userModerationActions,
	users,
} from "../../db/schema";
import { ServiceError } from "./serviceError";
import { config } from "../config";

class QueueService {
	/** Validates a user and inserts them into an available queue. */
	async join(userGuid: string, queueSlug: string) {
		return db.transaction(async (tx) => {
			const user = await tx.query.users.findFirst({
				where: eq(users.guid, userGuid),
			});

			// Check if user exists
			if (!user) {
				throw new ServiceError(
					"USER_NOT_FOUND",
					"User does not exist",
					404,
				);
			}

			// Check if the user is banned or if they have their platformId linked(they kinda must, but oh well)
			if (user.banned) {
				throw new ServiceError("USER_BANNED", "User is banned", 403);
			}
			const activeTimeout = await tx.query.userModerationActions.findFirst({
				columns: { guid: true, endsAt: true },
				where: and(
					eq(userModerationActions.userGuid, userGuid),
					eq(userModerationActions.action, "timeout"),
					isNull(userModerationActions.revokedAt),
					gt(userModerationActions.endsAt, new Date()),
				),
			});
			if (activeTimeout) {
				throw new ServiceError(
					"USER_TIMED_OUT",
					`User is timed out until ${activeTimeout.endsAt?.toISOString()}`,
					403,
				);
			}
			if (!user.platformId) {
				throw new ServiceError(
					"PLATFORM_ID_REQUIRED",
					"Link BeatLeader or ScoreSaber before joining a queue",
					403,
				);
			}

			const now = new Date();
			const queue = await tx.query.queues.findFirst({
				where:
					and(
						eq(queues.slug, queueSlug),
						eq(queues.enabled, true),
						lte(queues.opensAt, now),
						or(isNull(queues.closesAt), gt(queues.closesAt, now)),
					),
			});

			// Check if we are joining an available queue
			if (!queue) {
				throw new ServiceError(
					"QUEUE_UNAVAILABLE",
					"Queue is closed or does not exist",
					404,
				);
			}
			// Queue matching must be serialized across backend instances.
			await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${queue.guid}))`);

			const alreadyQueued = await tx.query.queuedPlayers.findFirst({
				columns: { guid: true },
				where: eq(queuedPlayers.userGuid, userGuid),
			});

			// Check if user is already in another queue
			if (alreadyQueued) {
				throw new ServiceError(
					"ALREADY_QUEUED",
					"User is already in a queue",
					409,
				);
			}
			const activeMatch = await tx.query.matchParticipants.findFirst({
				columns: { matchGuid: true },
				where:
					and(
						eq(matchParticipants.userGuid, userGuid),
						eq(matchParticipants.active, true),
					),
			});

			// Check if user has an active match
			if (activeMatch) {
				throw new ServiceError(
					"ALREADY_IN_MATCH",
					"User is already in an active match",
					409,
				);
			}

			const season = await tx.query.seasons.findFirst({
				columns: { guid: true, startingMmr: true },
				where:
					and(
						// Seasons are filtered to time already
						eq(seasons.isCurrent, true),
						lte(seasons.startsAt, now),
						or(isNull(seasons.endsAt), gt(seasons.endsAt, now)),
					),
			});

			// Check if season exists
			if (!season) {
				throw new ServiceError(
					"NO_CURRENT_SEASON",
					"No competitive season is active",
					503,
				);
			}
			const [stats] = await tx
				.insert(competitiveStatistics)
				.values({
					userGuid,
					seasonGuid: season.guid,
					currentMmr: season.startingMmr,
					startingMmr: season.startingMmr,
				})
				.onConflictDoNothing()
				.returning();
			const existingStats = stats
				?? await tx.query.competitiveStatistics.findFirst({
						where:
							and(
								eq(competitiveStatistics.userGuid, userGuid),
								eq(
									competitiveStatistics.seasonGuid,
									season.guid,
								),
							),
					});
			if (!existingStats) {
				throw new ServiceError("STATISTICS_NOT_FOUND", "Current season statistics could not be created", 500);
			}
			const mmr = existingStats.currentMmr;

			// Check if MMR is out of range
			if (mmr < queue.minMmr || mmr > queue.maxMmr) {
				throw new ServiceError(
					"MMR_OUT_OF_RANGE",
					"User MMR is outside this queue's range",
					403,
				);
			}

			const [entry] = await tx
				.insert(queuedPlayers)
				.values({
					queueGuid: queue.guid,
					userGuid,
					platformId: user.platformId,
				})
				.returning();

			const waitingEntries = await tx.query.queuedPlayers.findMany({
				where: eq(queuedPlayers.queueGuid, queue.guid),
				orderBy: asc(queuedPlayers.joinedAt),
				limit: 2,
				with: {
					user: {
						with: {
							competitiveStatistics: {
								where: eq(competitiveStatistics.seasonGuid, season.guid),
								limit: 1,
							},
						},
					},
				},
			});
			const waitingPlayers = waitingEntries.flatMap((queuedEntry) => {
				const playerStatistics = queuedEntry.user.competitiveStatistics[0];
				return playerStatistics
					? [{ entry: queuedEntry, user: queuedEntry.user, mmr: playerStatistics.currentMmr }]
					: [];
			});
			if (waitingPlayers.length < 2) {
				return { entry, queue, mmr, createdMatch: null };
			}

			// Recheck both candidates after taking the queue lock. A moderation action can happen while a player waits.
			const candidateUserGuids = waitingPlayers.map((player) => player.user.guid);
			const timedOutCandidates = await tx.query.userModerationActions.findMany({
				columns: { userGuid: true },
				where: and(
					inArray(userModerationActions.userGuid, candidateUserGuids),
					eq(userModerationActions.action, "timeout"),
					isNull(userModerationActions.revokedAt),
					gt(userModerationActions.endsAt, now),
				),
			});
			const invalidCandidateGuids = new Set([
				...waitingPlayers.filter((player) => player.user.banned).map((player) => player.user.guid),
				...timedOutCandidates.map((timeout) => timeout.userGuid),
			]);
			if (invalidCandidateGuids.size) {
				await tx.delete(queuedPlayers).where(inArray(queuedPlayers.userGuid, [...invalidCandidateGuids]));
				return { entry, queue, mmr, createdMatch: null };
			}

			const poolMaps = await tx.query.maps.findMany({
				where: eq(maps.poolGuid, queue.poolGuid),
				orderBy: sql`random()`,
				limit: 10,
			});
			if (poolMaps.length < 10) {
				return { entry, queue, mmr, createdMatch: null };
			}

			let redIndex = 0;
			if (queue.playerOneDecision === "highest_mmr_first") {
				redIndex = waitingPlayers[1].mmr > waitingPlayers[0].mmr ? 1 : 0;
			} else if (queue.playerOneDecision === "lowest_mmr_first") {
				redIndex = waitingPlayers[1].mmr < waitingPlayers[0].mmr ? 1 : 0;
			} else {
				redIndex = Math.random() < 0.5 ? 0 : 1;
			}
			const red = waitingPlayers[redIndex];
			const blue = waitingPlayers[redIndex === 0 ? 1 : 0];
			const startedAt = new Date();
			const [match] = await tx.insert(matches).values({
				queueGuid: queue.guid,
				seasonGuid: season.guid,
				poolGuid: queue.poolGuid,
				status: "awaiting_discards",
				competitive: queue.competitive,
				startingHealth: queue.startingHealth,
				kFactor: queue.kFactor,
				startedAt,
			}).returning();
			await tx.insert(matchParticipants).values([
				{
					matchGuid: match.guid,
					userGuid: red.user.guid,
					platformId: red.user.platformId!,
					role: "red",
					initialMmr: red.mmr,
					health: queue.startingHealth,
				},
				{
					matchGuid: match.guid,
					userGuid: blue.user.guid,
					platformId: blue.user.platformId!,
					role: "blue",
					initialMmr: blue.mmr,
					health: queue.startingHealth,
				},
			]);
			const [redHand, blueHand] = await tx.insert(matchHands).values([
				{ matchGuid: match.guid, userGuid: red.user.guid },
				{ matchGuid: match.guid, userGuid: blue.user.guid },
			]).returning();
			await tx.insert(matchHandMaps).values([
				...poolMaps.slice(0, 5).map((map, position) => ({
					handGuid: redHand.guid,
					mapGuid: map.guid,
					position,
				})),
				...poolMaps.slice(5).map((map, position) => ({
					handGuid: blueHand.guid,
					mapGuid: map.guid,
					position,
				})),
			]);
			await tx.insert(matchMapActions).values([
				...poolMaps.slice(0, 5).map((map) => ({
					matchGuid: match.guid,
					userGuid: red.user.guid,
					mapGuid: map.guid,
					action: "dealt" as const,
				})),
				...poolMaps.slice(5).map((map) => ({
					matchGuid: match.guid,
					userGuid: blue.user.guid,
					mapGuid: map.guid,
					action: "dealt" as const,
				})),
			]);
			await tx.insert(matchAuditEvents).values([
				{
					matchGuid: match.guid,
					userGuid: red.user.guid,
					eventType: "initial_hand_dealt",
					source: "server",
					metadata: { mapGuids: poolMaps.slice(0, 5).map((map) => map.guid) },
					createdAt: startedAt,
				},
				{
					matchGuid: match.guid,
					userGuid: blue.user.guid,
					eventType: "initial_hand_dealt",
					source: "server",
					metadata: { mapGuids: poolMaps.slice(5).map((map) => map.guid) },
					createdAt: startedAt,
				},
			]);
			await tx.insert(matchStatusHistory).values({
				matchGuid: match.guid,
				fromStatus: "waiting_players",
				toStatus: "awaiting_discards",
				reason: "queue_match_created",
			});
			const discardDueAt = new Date(startedAt.getTime() + config.discardSeconds * 1000);
			await tx.insert(matchTimers).values({
				matchGuid: match.guid,
				kind: "discard",
				dueAt: discardDueAt,
				idempotencyKey: `discard:${match.guid}`,
				payload: { matchGuid: match.guid },
			});
			await tx.delete(queuedPlayers).where(inArray(
				queuedPlayers.guid,
				waitingPlayers.map((player) => player.entry.guid),
			));
			return {
				entry,
				queue,
				mmr,
				createdMatch: {
					match,
					red,
					blue,
					redMaps: poolMaps.slice(0, 5),
					blueMaps: poolMaps.slice(5),
					discardDueAt,
				},
			};
		});
	}

	/** Removes a user's queue entry and reports whether one existed. */
	async leave(userGuid: string): Promise<boolean> {
		const removed = await db
			.delete(queuedPlayers)
			.where(eq(queuedPlayers.userGuid, userGuid))
			.returning({ guid: queuedPlayers.guid });
		return removed.length > 0;
	}

	/** Reports whether a user currently has a queue entry. */
	async isQueued(userGuid: string): Promise<boolean> {
		const entry = await db.query.queuedPlayers.findFirst({
			columns: { guid: true },
			where: eq(queuedPlayers.userGuid, userGuid),
		});
		return Boolean(entry);
	}
}

export const queueService = new QueueService();
