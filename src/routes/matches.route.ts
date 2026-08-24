import { Router } from "express";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../../db/db";
import {
	matchHandMaps,
	matchHands,
	matchMapActions,
	matchParticipants,
	matchRounds,
	matchScores,
	matches,
	matchStatusHistory,
	users,
} from "../../db/schema";
import { optionalAuth, requireAuth } from "../middleware/auth.middleware";

const router = Router();

router.use("/matches/:matchGuid", optionalAuth, async (req, res, next) => {
	const match = await db.query.matches.findFirst({
		columns: { isMock: true },
		where: eq(matches.guid, String(req.params.matchGuid)),
	});
	if (match?.isMock && !req.user?.permissions.some((permission) => ["role:admin", "role:dev"].includes(permission))) {
		res.status(404).json({ error: { code: "MATCH_NOT_FOUND", message: "Match does not exist" } });
		return;
	}
	next();
});

/**
 * @openapi
 * /matches/{matchGuid}/discards:
 *   post:
 *     tags: [Matches]
 *     summary: "Discard maps from the authenticated player's hand"
 *     description: "This endpoint requires an authenticated BeatKhana account."
 *     operationId: postMatchesByMatchGuidDiscards
 *     security:
 *       - BeatKhanaAuth: []
 *     parameters:
 *       - in: path
 *         name: matchGuid
 *         required: true
 *         description: "Identifies the matchGuid resource."
 *         schema:
 *           type: string
 *     requestBody:
 *       required: false
 *       description: Request payload reserved for the endpoint implementation.
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             additionalProperties: true
 *     responses:
 *       405:
 *         description: Queue and match gameplay changes must be sent over the authenticated websocket.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiError'
 */
router.post("/matches/:matchGuid/discards", (_req, res) => {
	res.status(405).json({
		error: {
			code: "SOCKET_ONLY",
			message: "Discard maps through the authenticated discardMaps socket packet",
		},
	});
});

/**
 * @openapi
 * /matches/{matchGuid}/hands:
 *   get:
 *     tags: [Matches]
 *     summary: "List persisted player hands"
 *     description: "Public spectator view of the map hands dealt in a match."
 *     operationId: getMatchesByMatchGuidHands
 *     parameters:
 *       - in: path
 *         name: matchGuid
 *         required: true
 *         description: "Identifies the matchGuid resource."
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: The request completed successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               additionalProperties: true
 *       400:
 *         description: The request was invalid.
 *       401:
 *         description: Authentication is required when the endpoint is protected.
 *       403:
 *         description: The authenticated account does not have the required permission.
 *       404:
 *         description: The requested resource was not found.
 *       409:
 *         description: The request conflicts with the current resource state.
 */
router.get("/matches/:matchGuid/hands", async (req, res) => {
	const matchGuid = String(req.params.matchGuid);
	const rows = await db.query.matchHands.findMany({
		where: eq(matchHands.matchGuid, matchGuid),
		with: { maps: { with: { map: true } }, user: true },
	});
	res.json(rows);
});

/**
 * @openapi
 * /matches/{matchGuid}/map-actions:
 *   get:
 *     tags: [Matches]
 *     summary: "List dealt, discarded and picked maps"
 *     description: "Public spectator timeline of every map decision in a match."
 *     operationId: getMatchesByMatchGuidMapActions
 *     parameters:
 *       - in: path
 *         name: matchGuid
 *         required: true
 *         description: "Identifies the matchGuid resource."
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: The request completed successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               additionalProperties: true
 *       400:
 *         description: The request was invalid.
 *       401:
 *         description: Authentication is required when the endpoint is protected.
 *       403:
 *         description: The authenticated account does not have the required permission.
 *       404:
 *         description: The requested resource was not found.
 *       409:
 *         description: The request conflicts with the current resource state.
 */
router.get("/matches/:matchGuid/map-actions", async (req, res) => {
	res.json(await db.query.matchMapActions.findMany({
		where: eq(matchMapActions.matchGuid, String(req.params.matchGuid)),
		orderBy: matchMapActions.createdAt,
		with: { map: true, user: true },
	}));
});

/**
 * @openapi
 * /matches/{matchGuid}/participants:
 *   get:
 *     tags: [Matches]
 *     summary: "List match participants"
 *     description: "Public player and rating state for a match."
 *     operationId: getMatchesByMatchGuidParticipants
 *     parameters:
 *       - in: path
 *         name: matchGuid
 *         required: true
 *         description: "Identifies the matchGuid resource."
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: The request completed successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               additionalProperties: true
 *       400:
 *         description: The request was invalid.
 *       401:
 *         description: Authentication is required when the endpoint is protected.
 *       403:
 *         description: The authenticated account does not have the required permission.
 *       404:
 *         description: The requested resource was not found.
 *       409:
 *         description: The request conflicts with the current resource state.
 */
router.get("/matches/:matchGuid/participants", async (req, res) => {
	res.json(await db.query.matchParticipants.findMany({
		where: eq(matchParticipants.matchGuid, String(req.params.matchGuid)),
		with: { user: true },
	}));
});

/**
 * @openapi
 * /matches/{matchGuid}/participants:
 *   post:
 *     tags: [Matches]
 *     summary: "Add a match participant"
 *     description: "This endpoint requires an authenticated administrator."
 *     operationId: postMatchesByMatchGuidParticipants
 *     security:
 *       - BeatKhanaAuth: []
 *     x-required-roles:
 *       - admin
 *     parameters:
 *       - in: path
 *         name: matchGuid
 *         required: true
 *         description: "Identifies the matchGuid resource."
 *         schema:
 *           type: string
 *     requestBody:
 *       required: false
 *       description: Request payload reserved for the endpoint implementation.
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             additionalProperties: true
 *     responses:
 *       201:
 *         description: The resource was created.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               additionalProperties: true
 *       400:
 *         description: The request was invalid.
 *       401:
 *         description: Authentication is required when the endpoint is protected.
 *       403:
 *         description: The authenticated account does not have the required permission.
 *       404:
 *         description: The requested resource was not found.
 *       409:
 *         description: The request conflicts with the current resource state.
 */
router.post("/matches/:matchGuid/participants", requireAuth, async (req, res) => {
	if (!req.user?.permissions.some((permission) => ["role:admin", "role:dev"].includes(permission))) {
		res.status(403).json({ error: { code: "FORBIDDEN", message: "An administrator is required" } });
		return;
	}
	const { userGuid, role, initialMmr } = req.body as { userGuid?: string; role?: "red" | "blue" | "spectator"; initialMmr?: number };
	if (!userGuid || !role || !Number.isInteger(initialMmr) || initialMmr! < 0) {
		res.status(400).json({ error: { code: "INVALID_PARTICIPANT", message: "userGuid, role and a non-negative initialMmr are required" } });
		return;
	}
	const user = await db.query.users.findFirst({
		where: eq(users.guid, userGuid),
	});
	if (!user?.platformId) {
		res.status(422).json({ error: { code: "PLATFORM_ID_REQUIRED", message: "The participant must have a platform ID" } });
		return;
	}
	try {
		const [created] = await db.insert(matchParticipants).values({
			matchGuid: String(req.params.matchGuid),
			userGuid,
			platformId: user.platformId,
			role,
			initialMmr: initialMmr!,
		}).returning();
		res.status(201).json(created);
	} catch {
		res.status(409).json({ error: { code: "PARTICIPANT_CONFLICT", message: "The participant cannot be added to this match" } });
	}
});

/**
 * @openapi
 * /matches/{matchGuid}/status-history:
 *   get:
 *     tags: [Matches]
 *     summary: "List persisted match status changes"
 *     description: "Public chronological status and administration history for a match."
 *     operationId: getMatchesByMatchGuidStatusHistory
 *     parameters:
 *       - in: path
 *         name: matchGuid
 *         required: true
 *         description: "Identifies the matchGuid resource."
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: The request completed successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               additionalProperties: true
 *       400:
 *         description: The request was invalid.
 *       401:
 *         description: Authentication is required when the endpoint is protected.
 *       403:
 *         description: The authenticated account does not have the required permission.
 *       404:
 *         description: The requested resource was not found.
 *       409:
 *         description: The request conflicts with the current resource state.
 */
router.get("/matches/:matchGuid/status-history", async (req, res) => {
	res.json(await db.query.matchStatusHistory.findMany({
		where: eq(matchStatusHistory.matchGuid, String(req.params.matchGuid)),
		orderBy: matchStatusHistory.createdAt,
		with: { actor: true },
	}));
});

/**
 * @openapi
 * /matches/{matchGuid}/participants/{userGuid}:
 *   delete:
 *     tags: [Matches]
 *     summary: "Remove a match participant"
 *     description: "This endpoint requires an authenticated administrator."
 *     operationId: deleteMatchesByMatchGuidParticipantsByUserGuid
 *     security:
 *       - BeatKhanaAuth: []
 *     x-required-roles:
 *       - admin
 *     parameters:
 *       - in: path
 *         name: matchGuid
 *         required: true
 *         description: "Identifies the matchGuid resource."
 *         schema:
 *           type: string
 *       - in: path
 *         name: userGuid
 *         required: true
 *         description: "Identifies the userGuid resource."
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: The request completed successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               additionalProperties: true
 *       400:
 *         description: The request was invalid.
 *       401:
 *         description: Authentication is required when the endpoint is protected.
 *       403:
 *         description: The authenticated account does not have the required permission.
 *       404:
 *         description: The requested resource was not found.
 *       409:
 *         description: The request conflicts with the current resource state.
 */
router.delete("/matches/:matchGuid/participants/:userGuid", requireAuth, async (req, res) => {
	if (!req.user?.permissions.some((permission) => ["role:admin", "role:dev"].includes(permission))) {
		res.status(403).json({ error: { code: "FORBIDDEN", message: "An administrator is required" } });
		return;
	}
	const [updated] = await db
		.update(matchParticipants)
		.set({ active: false, leftAt: new Date() })
		.where(and(
			eq(matchParticipants.matchGuid, String(req.params.matchGuid)),
			eq(matchParticipants.userGuid, String(req.params.userGuid)),
		))
		.returning();
	if (!updated) {
		res.status(404).json({ error: { code: "PARTICIPANT_NOT_FOUND", message: "Match participant does not exist" } });
		return;
	}
	res.json(updated);
});

/**
 * @openapi
 * /matches:
 *   get:
 *     tags: [Matches]
 *     summary: "List visible matches"
 *     description: "Public match browser with optional status and player filters."
 *     operationId: getMatches
 *     parameters:
 *       - in: query
 *         name: status
 *         required: false
 *         description: "Optional status query value."
 *         schema:
 *           type: string
 *       - in: query
 *         name: userGuid
 *         required: false
 *         description: "Optional userGuid query value."
 *         schema:
 *           type: string
 *       - in: query
 *         name: limit
 *         required: false
 *         description: "Optional limit query value."
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: The request completed successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               additionalProperties: true
 *       400:
 *         description: The request was invalid.
 *       401:
 *         description: Authentication is required when the endpoint is protected.
 *       403:
 *         description: The authenticated account does not have the required permission.
 *       404:
 *         description: The requested resource was not found.
 *       409:
 *         description: The request conflicts with the current resource state.
 */
router.get("/matches", optionalAuth, async (req, res) => {
	const limit = Math.min(100, Math.max(1, Number.parseInt(String(req.query.limit ?? "50"), 10) || 50));
	const includeMock = req.query.includeMock === "true"
		&& Boolean(req.user?.permissions.some((permission) => ["role:admin", "role:dev"].includes(permission)));
	const conditions = includeMock ? [] : [eq(matches.isMock, false)];
	if (typeof req.query.status === "string") {
		conditions.push(eq(matches.status, req.query.status as typeof matches.$inferSelect.status));
	}
	if (typeof req.query.userGuid === "string") {
		const matchRows = await db.query.matchParticipants.findMany({
			where: eq(matchParticipants.userGuid, req.query.userGuid),
			orderBy: desc(matchParticipants.createdAt),
			limit,
			with: { match: true },
		});
		res.json(matchRows.map((row) => row.match).filter((match) => includeMock || !match.isMock));
		return;
	}
	res.json(await db.query.matches.findMany({
		where: conditions.length ? and(...conditions) : undefined,
		orderBy: desc(matches.createdAt),
		limit,
		with: { participants: { with: { user: true } } },
	}));
});

/**
 * @openapi
 * /matches:
 *   post:
 *     tags: [Matches]
 *     summary: "Create a match"
 *     description: "This endpoint requires an authenticated administrator."
 *     operationId: postMatches
 *     security:
 *       - BeatKhanaAuth: []
 *     x-required-roles:
 *       - admin
 *     requestBody:
 *       required: false
 *       description: Request payload reserved for the endpoint implementation.
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             additionalProperties: true
 *     responses:
 *       201:
 *         description: The resource was created.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               additionalProperties: true
 *       400:
 *         description: The request was invalid.
 *       401:
 *         description: Authentication is required when the endpoint is protected.
 *       403:
 *         description: The authenticated account does not have the required permission.
 *       404:
 *         description: The requested resource was not found.
 *       409:
 *         description: The request conflicts with the current resource state.
 */
router.post("/matches", requireAuth, async (req, res) => {
	if (!req.user?.permissions.some((permission) => ["role:admin", "role:dev"].includes(permission))) {
		res.status(403).json({ error: { code: "FORBIDDEN", message: "An administrator is required" } });
		return;
	}
	try {
		const [created] = await db.insert(matches).values({
			queueGuid: req.body?.queueGuid ?? null,
			seasonGuid: req.body?.seasonGuid ?? null,
			poolGuid: req.body?.poolGuid ?? null,
			startingHealth: req.body?.startingHealth ?? 1,
			kFactor: req.body?.kFactor ?? 100,
		}).returning();
		res.status(201).json(created);
	} catch {
		res.status(409).json({ error: { code: "MATCH_CONFLICT", message: "The match could not be created with those values" } });
	}
});

/**
 * @openapi
 * /matches/{matchGuid}:
 *   get:
 *     tags: [Matches]
 *     summary: "Get a persisted match state"
 *     description: "Public complete match state used by the live spectator page."
 *     operationId: getMatchesByMatchGuid
 *     parameters:
 *       - in: path
 *         name: matchGuid
 *         required: true
 *         description: "Identifies the matchGuid resource."
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: The request completed successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               additionalProperties: true
 *       400:
 *         description: The request was invalid.
 *       401:
 *         description: Authentication is required when the endpoint is protected.
 *       403:
 *         description: The authenticated account does not have the required permission.
 *       404:
 *         description: The requested resource was not found.
 *       409:
 *         description: The request conflicts with the current resource state.
 */
router.get("/matches/:matchGuid", async (req, res) => {
	const matchGuid = String(req.params.matchGuid);
	const match = await db.query.matches.findFirst({
		where: eq(matches.guid, matchGuid),
		with: {
			queue: true,
			season: true,
			pool: true,
			winner: true,
			participants: { with: { user: true } },
			statusHistory: { with: { actor: true } },
			timers: true,
			hands: { with: { maps: { with: { map: true } } } },
			mapActions: { with: { map: true, user: true } },
			rounds: { with: { map: true, picker: true, winner: true, scores: true } },
		},
	});
	if (!match) {
		res.status(404).json({ error: { code: "MATCH_NOT_FOUND", message: "Match does not exist" } });
		return;
	}
	res.json(match);
});

export default router;
