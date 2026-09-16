import { and, eq, inArray, sql } from "drizzle-orm";
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
	mockClients,
	queuedPlayers,
	queues,
	seasons,
	users,
} from "../../db/schema";
import { ServiceError } from "./serviceError";
import { config } from "../config";

class MockClientService {
	/** Pairs the developer's queued plugin client with one web-controlled opponent. */
	async createQueuedMatch(ownerUserGuid: string, mockPlatformId: string) {
		const normalizedPlatformId = mockPlatformId.trim();
		if (!normalizedPlatformId) {
			throw new ServiceError("INVALID_MOCK_PLAYER", "A mock opponent platform id is required", 400);
		}

		return db.transaction(async (tx) => {
			const owner = await tx.query.users.findFirst({ where: eq(users.guid, ownerUserGuid) });
			if (!owner?.permissions.includes("role:dev")) {
				throw new ServiceError("FORBIDDEN", "Developer permission is required", 403);
			}

			const initialQueueEntry = await tx.query.queuedPlayers.findFirst({
				where: eq(queuedPlayers.userGuid, ownerUserGuid),
			});
			if (!initialQueueEntry) {
				throw new ServiceError("NOT_QUEUED", "Join a queue from the plugin before creating a mock opponent", 409);
			}

			// Serialize with normal matchmaking. The entry is re-read after the lock in case
			// another real player matched with the plugin while this request was waiting.
			await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${initialQueueEntry.queueGuid}))`);
			const queueEntry = await tx.query.queuedPlayers.findFirst({
				where: eq(queuedPlayers.userGuid, ownerUserGuid),
				with: { queue: true, user: true },
			});
			if (!queueEntry) {
				throw new ServiceError("NOT_QUEUED", "The plugin is no longer waiting in a queue", 409);
			}

			const [mockUser, currentSeason] = await Promise.all([
				tx.query.users.findFirst({ where: eq(users.platformId, normalizedPlatformId) }),
				tx.query.seasons.findFirst({ where: eq(seasons.isCurrent, true) }),
			]);
			if (!mockUser) {
				throw new ServiceError("USER_NOT_FOUND", "The mock platform id does not belong to a CompCube user", 404);
			}
			if (mockUser.guid === ownerUserGuid) {
				throw new ServiceError("INVALID_MOCK_PLAYER", "The mock opponent must be a different user", 400);
			}
			if (!currentSeason) {
				throw new ServiceError("NO_CURRENT_SEASON", "No competitive season is active", 503);
			}

			const [mockActiveMatch, mockQueueEntry, poolMaps, stats] = await Promise.all([
				tx.query.matchParticipants.findFirst({
					columns: { matchGuid: true },
					where: and(
						eq(matchParticipants.userGuid, mockUser.guid),
						eq(matchParticipants.active, true),
					),
				}),
				tx.query.queuedPlayers.findFirst({
					columns: { guid: true },
					where: eq(queuedPlayers.userGuid, mockUser.guid),
				}),
				tx.query.maps.findMany({
					where: eq(maps.poolGuid, queueEntry.queue.poolGuid),
					orderBy: sql`random()`,
					limit: 10,
				}),
				tx.query.competitiveStatistics.findMany({
					where: and(
						eq(competitiveStatistics.seasonGuid, currentSeason.guid),
						inArray(competitiveStatistics.userGuid, [ownerUserGuid, mockUser.guid]),
					),
				}),
			]);
			if (mockActiveMatch) {
				throw new ServiceError("MOCK_PLAYER_IN_MATCH", "The mock opponent is already in an active match", 409);
			}
			if (mockQueueEntry) {
				throw new ServiceError("MOCK_PLAYER_QUEUED", "The mock opponent is currently queued as a real client", 409);
			}
			if (poolMaps.length < 10) {
				throw new ServiceError("INSUFFICIENT_MAPS", "A mock match needs at least ten pool maps", 409);
			}

			const pluginMmr = stats.find((entry) => entry.userGuid === ownerUserGuid)?.currentMmr
				?? currentSeason.startingMmr;
			const mockMmr = stats.find((entry) => entry.userGuid === mockUser.guid)?.currentMmr
				?? currentSeason.startingMmr;
			const startedAt = new Date();
			const [match] = await tx.insert(matches).values({
				queueGuid: queueEntry.queue.guid,
				seasonGuid: currentSeason.guid,
				poolGuid: queueEntry.queue.poolGuid,
				status: "awaiting_discards",
				competitive: false,
				startingHealth: queueEntry.queue.startingHealth,
				kFactor: queueEntry.queue.kFactor,
				isMock: true,
				mockOwnerUserGuid: ownerUserGuid,
				startedAt,
			}).returning();
			await tx.insert(matchParticipants).values([
				{ matchGuid: match.guid, userGuid: owner.guid, platformId: owner.platformId!, role: "red", initialMmr: pluginMmr, health: queueEntry.queue.startingHealth },
				{ matchGuid: match.guid, userGuid: mockUser.guid, platformId: mockUser.platformId!, role: "blue", initialMmr: mockMmr, health: queueEntry.queue.startingHealth },
			]);
			const [pluginHand, mockHand] = await tx.insert(matchHands).values([
				{ matchGuid: match.guid, userGuid: owner.guid },
				{ matchGuid: match.guid, userGuid: mockUser.guid },
			]).returning();
			const pluginMaps = poolMaps.slice(0, 5);
			const mockMaps = poolMaps.slice(5);
			await tx.insert(matchHandMaps).values([
				...pluginMaps.map((map, position) => ({ handGuid: pluginHand.guid, mapGuid: map.guid, position })),
				...mockMaps.map((map, position) => ({ handGuid: mockHand.guid, mapGuid: map.guid, position })),
			]);
			await tx.insert(matchMapActions).values([
				...pluginMaps.map((map) => ({ matchGuid: match.guid, userGuid: owner.guid, mapGuid: map.guid, action: "dealt" as const })),
				...mockMaps.map((map) => ({ matchGuid: match.guid, userGuid: mockUser.guid, mapGuid: map.guid, action: "dealt" as const })),
			]);
			await tx.insert(matchAuditEvents).values([
				{ matchGuid: match.guid, userGuid: owner.guid, eventType: "initial_hand_dealt", source: "server", metadata: { mapGuids: pluginMaps.map((map) => map.guid) }, createdAt: startedAt },
				{ matchGuid: match.guid, userGuid: mockUser.guid, eventType: "initial_hand_dealt", source: "server", metadata: { mapGuids: mockMaps.map((map) => map.guid) }, createdAt: startedAt },
			]);
			await tx.insert(matchStatusHistory).values({
				matchGuid: match.guid,
				fromStatus: "waiting_players",
				toStatus: "awaiting_discards",
				reason: "queued_plugin_mock_match_created",
				actorUserGuid: ownerUserGuid,
			});
			const discardDueAt = new Date(startedAt.getTime() + config.discardSeconds * 1000);
			await tx.insert(matchTimers).values({
				matchGuid: match.guid,
				kind: "discard",
				dueAt: discardDueAt,
				idempotencyKey: `discard:${match.guid}`,
				payload: { matchGuid: match.guid },
			});
			const [client] = await tx.insert(mockClients).values({
				ownerUserGuid,
				impersonatedUserGuid: mockUser.guid,
				matchGuid: match.guid,
				expiresAt: new Date(startedAt.getTime() + 8 * 60 * 60 * 1000),
			}).returning();
			await tx.delete(queuedPlayers).where(eq(queuedPlayers.guid, queueEntry.guid));

			return {
				match,
				client,
				pluginUser: owner,
				mockUser,
				pluginMaps,
				mockMaps,
				discardDueAt,
			};
		});
	}

	/** Creates two web-controlled clients and starts a private non-competitive match on the real match state machine. */
	async createMatch(ownerUserGuid: string, redPlatformId: string, bluePlatformId: string, queueGuid: string) {
		if (!redPlatformId.trim() || !bluePlatformId.trim() || redPlatformId === bluePlatformId) {
			throw new ServiceError("INVALID_MOCK_PLAYERS", "Two different platform ids are required", 400);
		}
		return db.transaction(async (tx) => {
			const owner = await tx.query.users.findFirst({ where: eq(users.guid, ownerUserGuid) });
			if (!owner?.permissions.includes("role:dev")) {
				throw new ServiceError("FORBIDDEN", "Developer permission is required", 403);
			}
			const [redUser, blueUser, queue, currentSeason] = await Promise.all([
				tx.query.users.findFirst({ where: eq(users.platformId, redPlatformId.trim()) }),
				tx.query.users.findFirst({ where: eq(users.platformId, bluePlatformId.trim()) }),
				tx.query.queues.findFirst({ where: eq(queues.guid, queueGuid), with: { pool: true } }),
				tx.query.seasons.findFirst({ where: eq(seasons.isCurrent, true) }),
			]);
			if (!redUser || !blueUser) {
				throw new ServiceError("USER_NOT_FOUND", "Both platform ids must belong to CompCube users", 404);
			}
			if (!queue) throw new ServiceError("QUEUE_NOT_FOUND", "Queue does not exist", 404);
			const poolMaps = await tx.query.maps.findMany({
				where: eq(maps.poolGuid, queue.poolGuid),
				orderBy: sql`random()`,
				limit: 10,
			});
			if (poolMaps.length < 10) {
				throw new ServiceError("INSUFFICIENT_MAPS", "A mock match needs at least ten pool maps", 409);
			}
			const stats = currentSeason
				? await tx.query.competitiveStatistics.findMany({
					where: and(
						eq(competitiveStatistics.seasonGuid, currentSeason.guid),
						inArray(competitiveStatistics.userGuid, [redUser.guid, blueUser.guid]),
					),
				})
				: [];
			const redMmr = stats.find((entry) => entry.userGuid === redUser.guid)?.currentMmr ?? currentSeason?.startingMmr ?? 1000;
			const blueMmr = stats.find((entry) => entry.userGuid === blueUser.guid)?.currentMmr ?? currentSeason?.startingMmr ?? 1000;
			const startedAt = new Date();
			const [match] = await tx.insert(matches).values({
				queueGuid: queue.guid,
				seasonGuid: currentSeason?.guid,
				poolGuid: queue.poolGuid,
				status: "awaiting_discards",
				competitive: false,
				startingHealth: queue.startingHealth,
				kFactor: queue.kFactor,
				isMock: true,
				mockOwnerUserGuid: ownerUserGuid,
				startedAt,
			}).returning();
			await tx.insert(matchParticipants).values([
				{ matchGuid: match.guid, userGuid: redUser.guid, platformId: redUser.platformId!, role: "red", initialMmr: redMmr, health: queue.startingHealth },
				{ matchGuid: match.guid, userGuid: blueUser.guid, platformId: blueUser.platformId!, role: "blue", initialMmr: blueMmr, health: queue.startingHealth },
			]);
			const [redHand, blueHand] = await tx.insert(matchHands).values([
				{ matchGuid: match.guid, userGuid: redUser.guid },
				{ matchGuid: match.guid, userGuid: blueUser.guid },
			]).returning();
			await tx.insert(matchHandMaps).values([
				...poolMaps.slice(0, 5).map((map, position) => ({ handGuid: redHand.guid, mapGuid: map.guid, position })),
				...poolMaps.slice(5).map((map, position) => ({ handGuid: blueHand.guid, mapGuid: map.guid, position })),
			]);
			await tx.insert(matchMapActions).values([
				...poolMaps.slice(0, 5).map((map) => ({ matchGuid: match.guid, userGuid: redUser.guid, mapGuid: map.guid, action: "dealt" as const })),
				...poolMaps.slice(5).map((map) => ({ matchGuid: match.guid, userGuid: blueUser.guid, mapGuid: map.guid, action: "dealt" as const })),
			]);
			await tx.insert(matchAuditEvents).values([
				{ matchGuid: match.guid, userGuid: redUser.guid, eventType: "initial_hand_dealt", source: "server", metadata: { mapGuids: poolMaps.slice(0, 5).map((map) => map.guid) }, createdAt: startedAt },
				{ matchGuid: match.guid, userGuid: blueUser.guid, eventType: "initial_hand_dealt", source: "server", metadata: { mapGuids: poolMaps.slice(5).map((map) => map.guid) }, createdAt: startedAt },
			]);
			await tx.insert(matchStatusHistory).values({
				matchGuid: match.guid,
				fromStatus: "waiting_players",
				toStatus: "awaiting_discards",
				reason: "mock_match_created",
				actorUserGuid: ownerUserGuid,
			});
			await tx.insert(matchTimers).values({
				matchGuid: match.guid,
				kind: "discard",
				dueAt: new Date(startedAt.getTime() + config.discardSeconds * 1000),
				idempotencyKey: `discard:${match.guid}`,
				payload: { matchGuid: match.guid },
			});
			const expiresAt = new Date(startedAt.getTime() + 8 * 60 * 60 * 1000);
			const clients = await tx.insert(mockClients).values([
				{ ownerUserGuid, impersonatedUserGuid: redUser.guid, matchGuid: match.guid, expiresAt },
				{ ownerUserGuid, impersonatedUserGuid: blueUser.guid, matchGuid: match.guid, expiresAt },
			]).returning();
			return { match, clients, redUser, blueUser };
		});
	}
}

export const mockClientService = new MockClientService();
