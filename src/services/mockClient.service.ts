import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "../../db/db";
import {
	competitiveStatistics,
	maps,
	matchHandMaps,
	matchHands,
	matchMapActions,
	matchParticipants,
	matches,
	matchStatusHistory,
	matchTimers,
	mockClients,
	queues,
	seasons,
	users,
} from "../../db/schema";
import { ServiceError } from "./serviceError";
import { config } from "../config";

class MockClientService {
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
