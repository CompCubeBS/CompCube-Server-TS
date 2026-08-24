import { Router } from "express";
import { and, eq } from "drizzle-orm";
import { db } from "../../db/db";
import { mockClients } from "../../db/schema";
import { requireAuth } from "../middleware/auth.middleware";
import { gameplayService } from "../services/gameplay.service";
import { mockClientService } from "../services/mockClient.service";

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
		let result: unknown;
		if (action === "discard" && Array.isArray(req.body?.mapGuids)) {
			result = await gameplayService.discardMaps(client.matchGuid, client.impersonatedUserGuid, req.body.mapGuids);
		} else if (action === "pick" && typeof req.body?.mapGuid === "string") {
			result = await gameplayService.selectMap(client.matchGuid, client.impersonatedUserGuid, req.body.mapGuid);
		} else if (action === "score" && typeof req.body?.roundGuid === "string") {
			result = await gameplayService.submitScore(client.matchGuid, req.body.roundGuid, client.impersonatedUserGuid, {
				rawScore: Number(req.body.rawScore),
				modifiedScore: Number(req.body.modifiedScore),
				noFailTriggered: req.body.noFailTriggered === true,
				proMode: req.body.proMode === true,
				missCount: Number(req.body.missCount),
				fullCombo: req.body.fullCombo === true,
			});
		} else if (action === "forfeit" || action === "disconnect") {
			result = await gameplayService.forfeitMatch(
				client.matchGuid,
				client.impersonatedUserGuid,
				req.user.guid,
				action === "disconnect" ? "mock_client_disconnected" : "mock_client_forfeited",
			);
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
