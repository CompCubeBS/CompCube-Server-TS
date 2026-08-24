import { Router } from "express";
import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { db } from "../../db/db";
import { competitiveStatistics, matchParticipants, matches, queuedPlayers, seasons, userModerationActions, users } from "../../db/schema";
import { requireAuth } from "../middleware/auth.middleware";

const router = Router();

/**
 * @openapi
 * /user/discord/{discordId}:
 *   get:
 *     tags: [Users]
 *     summary: "Get a user by Discord ID"
 *     description: "This endpoint is public."
 *     operationId: getUserDiscordByDiscordId
 *     parameters:
 *       - in: path
 *         name: discordId
 *         required: true
 *         description: "Identifies the discordId resource."
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
router.get("/user/discord/:discordId", async (req, res) => {
	const user = await db.query.users.findFirst({
		where: eq(users.discordId, String(req.params.discordId))
	});
	if (!user) {
		res.status(404).json({ error: { code: "USER_NOT_FOUND", message: "User does not exist" } });
		return;
	}
	res.json(user);
});

/**
 * @openapi
 * /user/id/{id}:
 *   get:
 *     tags: [Users]
 *     summary: "Get a user by platform ID"
 *     description: "This endpoint is public."
 *     operationId: getUserIdById
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: "Identifies the id resource."
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
router.get("/user/id/:id", async (req, res) => {
	const user = await db.query.users.findFirst({
		where: eq(users.platformId, String(req.params.id))
	});
	if (!user) {
		res.status(404).json({ error: { code: "USER_NOT_FOUND", message: "User does not exist" } });
		return;
	}
	res.json(user);
});

/**
 * @openapi
 * /users/{userGuid}/matches:
 *   get:
 *     tags: [Users]
 *     summary: "List a user's matches"
 *     description: "This endpoint is public."
 *     operationId: getUsersByUserGuidMatches
 *     parameters:
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
router.get("/users/:userGuid/matches", async (req, res) => {
	const history = await db.query.matchParticipants.findMany({
		where: eq(matchParticipants.userGuid, String(req.params.userGuid)),
		orderBy: desc(matchParticipants.createdAt),
		with: { match: true },
	});
	res.json(history.filter((entry) => !entry.match.isMock));
});

/**
 * @openapi
 * /users:
 *   get:
 *     tags: [Users]
 *     summary: "List CompCube users"
 *     description: "This endpoint requires an authenticated administrator."
 *     operationId: getUsers
 *     security:
 *       - BeatKhanaAuth: []
 *     x-required-roles:
 *       - admin
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
router.get("/users", requireAuth, async (req, res) => {
	if (!req.user?.permissions.some((permission) => ["role:admin", "role:dev"].includes(permission))) {
		res.status(403).json({ error: { code: "FORBIDDEN", message: "An administrator is required" } });
		return;
	}
	const currentSeason = await db.query.seasons.findFirst({
		columns: { guid: true },
		where: eq(seasons.isCurrent, true),
	});
	res.json(await db.query.users.findMany({
		with: {
			competitiveStatistics: {
				where: currentSeason ? eq(competitiveStatistics.seasonGuid, currentSeason.guid) : undefined,
			},
			moderationActions: {
				where: and(
					isNull(userModerationActions.revokedAt),
					gt(userModerationActions.endsAt, new Date()),
				),
			},
		},
	}));
});

/**
 * @openapi
 * /users/{userGuid}:
 *   get:
 *     tags: [Users]
 *     summary: "Get a user by CompCube GUID"
 *     description: "This endpoint is public."
 *     operationId: getUsersByUserGuid
 *     parameters:
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
router.get("/users/:userGuid", async (req, res) => {
	const user = await db.query.users.findFirst({
		where: eq(users.guid, String(req.params.userGuid)),
		with: {
			competitiveStatistics: { with: { season: true } },
			matchParticipants: {
				with: { match: true },
			},
			moderationActions: {
				where: and(
					eq(userModerationActions.action, "timeout"),
					isNull(userModerationActions.revokedAt),
					gt(userModerationActions.endsAt, new Date()),
				),
			},
		},
	});
	if (!user) {
		res.status(404).json({ error: { code: "USER_NOT_FOUND", message: "User does not exist" } });
		return;
	}
	res.json({
		...user,
		matchParticipants: user.matchParticipants.filter((participant) => !participant.match.isMock),
	});
});

/**
 * @openapi
 * /users/{userGuid}:
 *   patch:
 *     tags: [Users]
 *     summary: "Update a user as an administrator"
 *     description: "This endpoint requires an authenticated administrator."
 *     operationId: patchUsersByUserGuid
 *     security:
 *       - BeatKhanaAuth: []
 *     x-required-roles:
 *       - admin
 *     parameters:
 *       - in: path
 *         name: userGuid
 *         required: true
 *         description: "Identifies the userGuid resource."
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
router.patch("/users/:userGuid", requireAuth, async (req, res) => {
	if (!req.user?.permissions.some((permission) => ["role:admin", "role:dev"].includes(permission))) {
		res.status(403).json({ error: { code: "FORBIDDEN", message: "An administrator is required" } });
		return;
	}
	const update: Record<string, unknown> = { updatedAt: new Date() };
	for (const field of ["banned", "permissions", "username", "avatarUrl", "beatKhanaGuid", "discordId", "platformId"] as const) {
		if (req.body?.[field] !== undefined) update[field] = req.body[field];
	}
	for (const field of ["discordId", "platformId"] as const) {
		if (update[field] !== undefined && update[field] !== null && (typeof update[field] !== "string" || !/^\d+$/.test(update[field]))) {
			res.status(400).json({ error: { code: "INVALID_USER_ID", message: `${field} must be numeric or null` } });
			return;
		}
	}
	const userGuid = String(req.params.userGuid);
	let updated: typeof users.$inferSelect | undefined;
	try {
		[updated] = await db.update(users).set(update).where(eq(users.guid, userGuid)).returning();
	} catch {
		res.status(409).json({ error: { code: "USER_ID_CONFLICT", message: "One of the account IDs is already assigned or invalid" } });
		return;
	}
	if (!updated) {
		res.status(404).json({ error: { code: "USER_NOT_FOUND", message: "User does not exist" } });
		return;
	}
	if (updated.banned) {
		await db.delete(queuedPlayers).where(eq(queuedPlayers.userGuid, userGuid));
	}
	res.json(updated);
});

/**
 * @openapi
 * /users/{userGuid}:
 *   delete:
 *     tags: [Users]
 *     summary: "Delete a user as an administrator"
 *     description: "This endpoint requires an authenticated administrator."
 *     operationId: deleteUsersByUserGuid
 *     security:
 *       - BeatKhanaAuth: []
 *     x-required-roles:
 *       - admin
 *     parameters:
 *       - in: path
 *         name: userGuid
 *         required: true
 *         description: "Identifies the userGuid resource."
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
router.delete("/users/:userGuid", requireAuth, async (req, res) => {
	if (!req.user?.permissions.some((permission) => ["role:admin", "role:dev"].includes(permission))) {
		res.status(403).json({ error: { code: "FORBIDDEN", message: "An administrator is required" } });
		return;
	}
	try {
		const removed = await db.delete(users).where(eq(users.guid, String(req.params.userGuid))).returning({ guid: users.guid });
		if (!removed.length) {
			res.status(404).json({ error: { code: "USER_NOT_FOUND", message: "User does not exist" } });
			return;
		}
		res.status(204).send();
	} catch {
		res.status(409).json({ error: { code: "USER_HAS_HISTORY", message: "Users with retained match history cannot be deleted" } });
	}
});

export default router;
