import { Router } from "express";
import { eq } from "drizzle-orm";
import { db } from "../../db/db";
import { queuedPlayers, queues } from "../../db/schema";
import { requireAuth } from "../middleware/auth.middleware";

const router = Router();

/**
 * @openapi
 * /queues/{queueGuid}/members/me:
 *   post:
 *     tags: [Queues]
 *     summary: "Join a matchmaking queue"
 *     description: "This endpoint requires an authenticated BeatKhana account."
 *     operationId: postQueuesByQueueGuidMembersMe
 *     security:
 *       - BeatKhanaAuth: []
 *     parameters:
 *       - in: path
 *         name: queueGuid
 *         required: true
 *         description: "Identifies the queueGuid resource."
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
router.post("/queues/:queueGuid/members/me", (_req, res) => {
	res.status(405).json({
		error: {
			code: "SOCKET_ONLY",
			message: "Join queues through the authenticated joinQueue socket packet",
		},
	});
});

/**
 * @openapi
 * /queues/{queueGuid}/members/me:
 *   delete:
 *     tags: [Queues]
 *     summary: "Leave a matchmaking queue"
 *     description: "This endpoint requires an authenticated BeatKhana account."
 *     operationId: deleteQueuesByQueueGuidMembersMe
 *     security:
 *       - BeatKhanaAuth: []
 *     parameters:
 *       - in: path
 *         name: queueGuid
 *         required: true
 *         description: "Identifies the queueGuid resource."
 *         schema:
 *           type: string
 *     responses:
 *       405:
 *         description: Queue and match gameplay changes must be sent over the authenticated websocket.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiError'
 */
router.delete("/queues/:queueGuid/members/me", (_req, res) => {
	res.status(405).json({
		error: {
			code: "SOCKET_ONLY",
			message: "Leave queues through the authenticated leaveQueue socket packet",
		},
	});
});

/**
 * @openapi
 * /queues/me:
 *   get:
 *     tags: [Queues]
 *     summary: "Get the authenticated user's queue entry"
 *     description: "This endpoint requires an authenticated BeatKhana account."
 *     operationId: getQueuesMe
 *     security:
 *       - BeatKhanaAuth: []
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
router.get("/queues/me", requireAuth, async (req, res) => {
	const entry = await db.query.queuedPlayers.findFirst({
		where: eq(queuedPlayers.userGuid, req.user!.guid),
		with: { queue: true },
	});
	if (!entry) {
		res.status(404).json({ error: { code: "NOT_QUEUED", message: "User is not currently queued" } });
		return;
	}
	res.json(entry);
});

/**
 * @openapi
 * /queues/{queueGuid}/members:
 *   get:
 *     tags: [Queues]
 *     summary: "List queued players"
 *     description: "This endpoint requires an authenticated moderator or administrator."
 *     operationId: getQueuesByQueueGuidMembers
 *     security:
 *       - BeatKhanaAuth: []
 *     x-required-roles:
 *       - moderator
 *       - admin
 *     parameters:
 *       - in: path
 *         name: queueGuid
 *         required: true
 *         description: "Identifies the queueGuid resource."
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
router.get("/queues/:queueGuid/members", requireAuth, async (req, res) => {
	if (!req.user?.permissions.some((permission) =>
		["role:moderator", "role:admin", "role:dev"].includes(permission)
	)) {
		res.status(403).json({ error: { code: "FORBIDDEN", message: "A moderator is required" } });
		return;
	}
	res.json(
		await db.query.queuedPlayers.findMany({
			where: eq(queuedPlayers.queueGuid, String(req.params.queueGuid)),
			with: { user: true },
		}),
	);
});

/**
 * @openapi
 * /queues:
 *   get:
 *     tags: [Queues]
 *     summary: "List matchmaking queues"
 *     description: "This endpoint is public."
 *     operationId: getQueues
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
router.get("/queues", async (_req, res) => {
	const queueRows = await db.query.queues.findMany({
		with: { players: true, pool: true },
	});
	res.json(queueRows.map((queue) => {
		const { players, ...publicQueue } = queue;
		return {
			...publicQueue,
			queuedPlayers: players.length,
		};
	}));
});

/**
 * @openapi
 * /queues:
 *   post:
 *     tags: [Queues]
 *     summary: "Create a matchmaking queue"
 *     description: "This endpoint requires an authenticated administrator."
 *     operationId: postQueues
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
router.post("/queues", requireAuth, async (req, res) => {
	if (!req.user?.permissions.some((permission) =>
		["role:admin", "role:dev"].includes(permission)
	)) {
		res.status(403).json({ error: { code: "FORBIDDEN", message: "An administrator is required" } });
		return;
	}
	const {
		slug,
		name,
		poolGuid,
		competitive,
		enabled,
		minMmr,
		maxMmr,
		playerOneDecision,
		startingHealth,
		kFactor,
		opensAt,
		closesAt,
	} = req.body as Partial<typeof queues.$inferInsert>;
	if (!slug?.trim() || !name?.trim()) {
		res.status(400).json({ error: { code: "INVALID_QUEUE", message: "slug and name are required" } });
		return;
	}
	if (!poolGuid) {
		res.status(400).json({ error: { code: "INVALID_QUEUE", message: "poolGuid is required" } });
		return;
	}
	try {
		const [created] = await db
			.insert(queues)
			.values({
				slug: slug.trim(),
				name: name.trim(),
				poolGuid,
				competitive,
				enabled,
				minMmr,
				maxMmr,
				playerOneDecision,
				startingHealth,
				kFactor,
				opensAt,
				closesAt,
			})
			.returning();
		res.status(201).json(created);
	} catch {
		res.status(409).json({ error: { code: "QUEUE_CONFLICT", message: "The queue could not be created with those values" } });
	}
});

/**
 * @openapi
 * /queues/{queueGuid}:
 *   get:
 *     tags: [Queues]
 *     summary: "Get a matchmaking queue"
 *     description: "This endpoint is public."
 *     operationId: getQueuesByQueueGuid
 *     parameters:
 *       - in: path
 *         name: queueGuid
 *         required: true
 *         description: "Identifies the queueGuid resource."
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
router.get("/queues/:queueGuid", async (req, res) => {
	const queue = await db.query.queues.findFirst({
		where: eq(queues.guid, String(req.params.queueGuid)),
		with: { players: true, pool: true },
	});
	if (!queue) {
		res.status(404).json({ error: { code: "QUEUE_NOT_FOUND", message: "Queue does not exist" } });
		return;
	}
	res.json(queue);
});

/**
 * @openapi
 * /queues/{queueGuid}:
 *   patch:
 *     tags: [Queues]
 *     summary: "Update a matchmaking queue"
 *     description: "This endpoint requires an authenticated administrator."
 *     operationId: patchQueuesByQueueGuid
 *     security:
 *       - BeatKhanaAuth: []
 *     x-required-roles:
 *       - admin
 *     parameters:
 *       - in: path
 *         name: queueGuid
 *         required: true
 *         description: "Identifies the queueGuid resource."
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
router.patch("/queues/:queueGuid", requireAuth, async (req, res) => {
	if (!req.user?.permissions.some((permission) =>
		["role:admin", "role:dev"].includes(permission)
	)) {
		res.status(403).json({ error: { code: "FORBIDDEN", message: "An administrator is required" } });
		return;
	}
	const allowed = [
		"slug", "name", "poolGuid", "competitive", "enabled", "minMmr", "maxMmr",
		"playerOneDecision", "startingHealth", "kFactor", "opensAt", "closesAt",
	] as const;
	const update: Record<string, unknown> = { updatedAt: new Date() };
	for (const field of allowed) {
		if (req.body?.[field] !== undefined) update[field] = req.body[field];
	}
	const [updated] = await db
		.update(queues)
		.set(update)
		.where(eq(queues.guid, String(req.params.queueGuid)))
		.returning();
	if (!updated) {
		res.status(404).json({ error: { code: "QUEUE_NOT_FOUND", message: "Queue does not exist" } });
		return;
	}
	res.json(updated);
});

/**
 * @openapi
 * /queues/{queueGuid}:
 *   delete:
 *     tags: [Queues]
 *     summary: "Delete a matchmaking queue"
 *     description: "This endpoint requires an authenticated administrator."
 *     operationId: deleteQueuesByQueueGuid
 *     security:
 *       - BeatKhanaAuth: []
 *     x-required-roles:
 *       - admin
 *     parameters:
 *       - in: path
 *         name: queueGuid
 *         required: true
 *         description: "Identifies the queueGuid resource."
 *         schema:
 *           type: string
 *     responses:
 *       204:
 *         description: The resource was deleted.
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
router.delete("/queues/:queueGuid", requireAuth, async (req, res) => {
	if (!req.user?.permissions.some((permission) =>
		["role:admin", "role:dev"].includes(permission)
	)) {
		res.status(403).json({ error: { code: "FORBIDDEN", message: "An administrator is required" } });
		return;
	}
	const removed = await db
		.delete(queues)
		.where(eq(queues.guid, String(req.params.queueGuid)))
		.returning({ guid: queues.guid });
	if (!removed.length) {
		res.status(404).json({ error: { code: "QUEUE_NOT_FOUND", message: "Queue does not exist" } });
		return;
	}
	res.status(204).send();
});

export default router;
