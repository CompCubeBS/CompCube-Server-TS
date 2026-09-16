import { Router } from "express";
import { and, eq } from "drizzle-orm";
import type { Server } from "socket.io";
import { db } from "../../db/db";
import { mockClients } from "../../db/schema";
import { requireAuth } from "../middleware/auth.middleware";
import { gameplayService } from "../services/gameplay.service";
import { mockClientService } from "../services/mockClient.service";
import { emitForfeitResult, emitPickPhaseStarted, emitResolvedRound } from "../websocket/matchEvents";

const router = Router();

/**
 * @openapi
 * /mock-clients/matches:
 *   get:
 *     tags: [Mock Clients]
 *     summary: List mock matches controlled by the current developer
 *     security: [{ BeatKhanaAuth: [] }]
 *     x-required-roles: [dev]
 *     responses:
 *       200: { description: Mock clients with complete private match state. }
 *       403: { description: Developer permission is required. }
 *   post:
 *     tags: [Mock Clients]
 *     summary: Start a private mock match by impersonating two platform ids
 *     security: [{ BeatKhanaAuth: [] }]
 *     x-required-roles: [dev]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [redPlatformId, bluePlatformId, queueGuid]
 *             properties:
 *               redPlatformId: { type: string }
 *               bluePlatformId: { type: string }
 *               queueGuid: { type: string, format: uuid }
 *     responses:
 *       201: { description: Mock match and both web-controlled clients created. }
 *       400: { description: Platform ids are invalid. }
 *       403: { description: Developer permission is required. }
 *       404: { description: A user or queue does not exist. }
 */
router.get("/mock-clients/matches", requireAuth, async (req, res) => {
	if (!req.user?.permissions.includes("role:dev")) {
		res.status(403).json({ error: { code: "FORBIDDEN", message: "Developer permission is required" } });
		return;
	}
	res.json(await db.query.mockClients.findMany({
		where: eq(mockClients.ownerUserGuid, req.user.guid),
		with: {
			impersonatedUser: true,
			match: {
				with: {
					participants: { with: { user: true } },
					hands: { with: { maps: { with: { map: true } } } },
					rounds: { with: { map: true, scores: true } },
					timers: true,
					statusHistory: true,
				},
			},
		},
	}));
});

router.post("/mock-clients/matches", requireAuth, async (req, res) => {
	if (!req.user?.permissions.includes("role:dev")) {
		res.status(403).json({ error: { code: "FORBIDDEN", message: "Developer permission is required" } });
		return;
	}
	try {
		res.status(201).json(await mockClientService.createMatch(
			req.user.guid,
			typeof req.body?.redPlatformId === "string" ? req.body.redPlatformId : "",
			typeof req.body?.bluePlatformId === "string" ? req.body.bluePlatformId : "",
			typeof req.body?.queueGuid === "string" ? req.body.queueGuid : "",
		));
	} catch (error) {
		const status = error instanceof Error && "status" in error ? Number(error.status) : 400;
		res.status(status).json({ error: { code: "MOCK_MATCH_NOT_CREATED", message: error instanceof Error ? error.message : "Mock match could not be created" } });
	}
});

/**
 * @openapi
 * /mock-clients/matches/queued:
 *   post:
 *     tags: [Mock Clients]
 *     summary: Pair the current developer's queued plugin with a mock opponent
 *     security: [{ BeatKhanaAuth: [] }]
 *     x-required-roles: [dev]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [mockPlatformId]
 *             properties:
 *               mockPlatformId: { type: string }
 *     responses:
 *       201: { description: A mock match was created and delivered to the queued plugin. }
 *       409: { description: The developer is not queued or the mock identity is unavailable. }
 */
router.post("/mock-clients/matches/queued", requireAuth, async (req, res) => {
	if (!req.user?.permissions.includes("role:dev")) {
		res.status(403).json({ error: { code: "FORBIDDEN", message: "Developer permission is required" } });
		return;
	}
	try {
		const result = await mockClientService.createQueuedMatch(
			req.user.guid,
			typeof req.body?.mockPlatformId === "string" ? req.body.mockPlatformId : "",
		);
		const io = req.app.get("socket.io") as Server | undefined;
		if (io) {
			const userRoom = `user:${result.pluginUser.guid}`;
			io.in(userRoom).socketsJoin(`match:${result.match.guid}`);
			io.to(userRoom).emit("matchCreated", {
				matchGuid: result.match.guid,
				red: {
					guid: result.pluginUser.guid,
					platformId: result.pluginUser.platformId!,
					username: result.pluginUser.username,
					avatarUrl: result.pluginUser.avatarUrl,
				},
				blue: {
					guid: result.mockUser.guid,
					platformId: result.mockUser.platformId!,
					username: result.mockUser.username,
					avatarUrl: result.mockUser.avatarUrl,
				},
				initialMaps: result.pluginMaps.map((map) => ({
					guid: map.guid,
					hash: map.hash,
					characteristic: map.characteristic,
					difficulty: map.difficulty,
					modifiers: map.modifiers,
					durationSeconds: map.durationSeconds,
					maxScore: map.maxScore,
				})),
				timerDueAt: result.discardDueAt.toISOString(),
			});
		}
		res.status(201).json(result);
	} catch (error) {
		const status = error instanceof Error && "status" in error ? Number(error.status) : 400;
		const code = error instanceof Error && "code" in error ? String(error.code) : "MOCK_MATCH_NOT_CREATED";
		res.status(status).json({ error: { code, message: error instanceof Error ? error.message : "Mock match could not be created" } });
	}
});

/**
 * @openapi
 * /mock-clients/{clientGuid}/actions:
 *   post:
 *     tags: [Mock Clients]
 *     summary: Perform one match action as an impersonated mock client
 *     description: Supports discard, pick, score, forfeit and disconnect. The normal match services validate every state transition.
 *     security: [{ BeatKhanaAuth: [] }]
 *     x-required-roles: [dev]
 *     parameters:
 *       - in: path
 *         name: clientGuid
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [action]
 *             properties:
 *               action: { type: string, enum: [discard, pick, score, forfeit, disconnect] }
 *               mapGuids: { type: array, items: { type: string, format: uuid } }
 *               mapGuid: { type: string, format: uuid }
 *               roundGuid: { type: string, format: uuid }
 *               rawScore: { type: integer, minimum: 0 }
 *               modifiedScore: { type: integer, minimum: 0 }
 *               proMode: { type: boolean }
 *               missCount: { type: integer, minimum: 0 }
 *               fullCombo: { type: boolean }
 *     responses:
 *       200: { description: Action accepted by the match state machine. }
 *       400: { description: Action input is invalid. }
 *       403: { description: The client is not owned by this developer. }
 *       409: { description: The action is not valid in the current phase. }
 */
router.post("/mock-clients/:clientGuid/actions", requireAuth, async (req, res) => {
	if (!req.user?.permissions.includes("role:dev")) {
		res.status(403).json({ error: { code: "FORBIDDEN", message: "Developer permission is required" } });
		return;
	}
	const client = await db.query.mockClients.findFirst({
		where: and(
			eq(mockClients.guid, String(req.params.clientGuid)),
			eq(mockClients.ownerUserGuid, req.user.guid),
		),
		with: { match: true },
	});
	if (!client || !client.matchGuid || !client.match) {
		res.status(404).json({ error: { code: "MOCK_CLIENT_NOT_FOUND", message: "Mock client does not exist" } });
		return;
	}
	try {
		const action = req.body?.action;
		const io = req.app.get("socket.io") as Server | undefined;
		let result: unknown;
		if (action === "discard" && Array.isArray(req.body?.mapGuids)) {
			const actionResult = await gameplayService.discardMaps(client.matchGuid, client.impersonatedUserGuid, req.body.mapGuids);
			result = actionResult;
			if (io && actionResult.ready) await emitPickPhaseStarted(io, client.matchGuid);
		} else if (action === "pick" && typeof req.body?.mapGuid === "string") {
			const actionResult = await gameplayService.selectMap(client.matchGuid, client.impersonatedUserGuid, req.body.mapGuid);
			result = actionResult;
			if (io) {
				const map = {
					guid: actionResult.map.guid,
					hash: actionResult.map.hash,
					characteristic: actionResult.map.characteristic,
					difficulty: actionResult.map.difficulty,
					modifiers: actionResult.map.modifiers,
					durationSeconds: actionResult.map.durationSeconds,
					maxScore: actionResult.map.maxScore,
				};
				io.to(`match:${client.matchGuid}`).emit("playerSelectedMap", {
					matchGuid: client.matchGuid,
					roundNumber: actionResult.round.roundNumber,
					pickerUserGuid: client.impersonatedUserGuid,
					map,
				});
				io.to(`match:${client.matchGuid}`).emit("roundStarted", {
					matchGuid: client.matchGuid,
					roundGuid: actionResult.round.guid,
					roundNumber: actionResult.round.roundNumber,
					startsAt: actionResult.round.startedAt.toISOString(),
				});
				io.to(`match:${client.matchGuid}`).emit("startMap", {
					matchGuid: client.matchGuid,
					roundGuid: actionResult.round.guid,
					map,
					scoreDueAt: actionResult.dueAt.toISOString(),
				});
			}
		} else if (action === "score" && typeof req.body?.roundGuid === "string") {
			const actionResult = await gameplayService.submitScore(client.matchGuid, req.body.roundGuid, client.impersonatedUserGuid, {
				rawScore: Number(req.body.rawScore),
				modifiedScore: Number(req.body.modifiedScore),
				noFailTriggered: req.body.noFailTriggered === true,
				proMode: req.body.proMode === true,
				missCount: Number(req.body.missCount),
				fullCombo: req.body.fullCombo === true,
			});
			result = actionResult;
			if (io && actionResult.resolved) await emitResolvedRound(io, actionResult.resolved);
		} else if (action === "forfeit" || action === "disconnect") {
			const reason = action === "disconnect" ? "mock_client_disconnected" : "mock_client_forfeited";
			const actionResult = await gameplayService.forfeitMatch(
				client.matchGuid,
				client.impersonatedUserGuid,
				req.user.guid,
				reason,
			);
			result = actionResult;
			if (io) emitForfeitResult(io, client.matchGuid, actionResult, reason);
		} else {
			res.status(400).json({ error: { code: "INVALID_MOCK_ACTION", message: "Action payload is invalid" } });
			return;
		}
		await db.update(mockClients).set({
			connected: action !== "disconnect",
			lastAction: action,
			lastActionAt: new Date(),
		}).where(eq(mockClients.guid, client.guid));
		res.json(result);
	} catch (error) {
		const status = error instanceof Error && "status" in error ? Number(error.status) : 409;
		res.status(status).json({ error: { code: "MOCK_ACTION_REJECTED", message: error instanceof Error ? error.message : "Mock action was rejected" } });
	}
});

export default router;
