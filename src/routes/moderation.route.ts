import { Router } from "express";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "../../db/db";
import { competitiveStatistics, matchParticipants, matches, queuedPlayers, userModerationActions, users } from "../../db/schema";
import { requireAuth } from "../middleware/auth.middleware";
import { matchService } from "../services/match.service";
import { gameplayService } from "../services/gameplay.service";
import { revertMatchResult } from "../services/ranking.service";
import { moderationService } from "../services/moderation.service";

const router = Router();

/**
 * @openapi
 * /matches/{matchGuid}/abort:
 *   post:
 *     tags: [Moderation]
 *     summary: "Abort a match"
 *     description: "This endpoint requires an authenticated moderator or administrator."
 *     operationId: postMatchesByMatchGuidAbort
 *     security:
 *       - BeatKhanaAuth: []
 *     x-required-roles:
 *       - moderator
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
router.post("/matches/:matchGuid/abort", requireAuth, async (req, res) => {
	if (!req.user?.permissions.some((permission) => ["role:moderator", "role:admin", "role:dev"].includes(permission))) {
		res.status(403).json({ error: { code: "FORBIDDEN", message: "A moderator is required" } });
		return;
	}
	const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
	if (!reason) {
		res.status(400).json({ error: { code: "REASON_REQUIRED", message: "An abort reason is required" } });
		return;
	}
	try {
		const match = await matchService.transition(String(req.params.matchGuid), "aborted", {
			reason,
			actorUserGuid: req.user.guid,
		});
		const [updated] = await db.update(matches).set({
			outcomeKind: "admin_decision",
			outcomeReason: reason,
		}).where(eq(matches.guid, match.guid)).returning();
		res.json(updated);
	} catch (error) {
		res.status(409).json({ error: { code: "MATCH_NOT_ABORTABLE", message: error instanceof Error ? error.message : "Match cannot be aborted" } });
	}
});

/**
 * @openapi
 * /matches/{matchGuid}/decision:
 *   post:
 *     tags: [Moderation]
 *     summary: "Make a decision on behalf of a player"
 *     description: "This endpoint requires an authenticated moderator or administrator."
 *     operationId: postMatchesByMatchGuidDecision
 *     security:
 *       - BeatKhanaAuth: []
 *     x-required-roles:
 *       - moderator
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
router.post("/matches/:matchGuid/decision", requireAuth, async (req, res) => {
	if (!req.user?.permissions.some((permission) => ["role:moderator", "role:admin", "role:dev"].includes(permission))) {
		res.status(403).json({ error: { code: "FORBIDDEN", message: "A moderator is required" } });
		return;
	}
	const action = req.body?.action;
	const targetUserGuid = req.body?.targetUserGuid;
	const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
	if (action === "forfeit" && typeof targetUserGuid === "string" && reason) {
		res.json(await gameplayService.forfeitMatch(
			String(req.params.matchGuid),
			targetUserGuid,
			req.user.guid,
			reason,
		));
		return;
	}
	if (action === "set_health" && typeof targetUserGuid === "string" && typeof req.body?.health === "number" && req.body.health >= 0) {
		const [participant] = await db.update(matchParticipants).set({
			health: req.body.health,
		}).where(and(
			eq(matchParticipants.matchGuid, String(req.params.matchGuid)),
			eq(matchParticipants.userGuid, targetUserGuid),
		)).returning();
		if (!participant) {
			res.status(404).json({ error: { code: "PARTICIPANT_NOT_FOUND", message: "Match participant does not exist" } });
			return;
		}
		res.json(participant);
		return;
	}
	if (action === "declare_winner" && typeof req.body?.winnerUserGuid === "string" && reason) {
		if (!req.user.permissions.some((permission) => ["role:admin", "role:dev"].includes(permission))) {
			res.status(403).json({ error: { code: "FORBIDDEN", message: "An administrator is required to declare a winner" } });
			return;
		}
		const participants = await db.query.matchParticipants.findMany({
			where: eq(matchParticipants.matchGuid, String(req.params.matchGuid)),
		});
		const loser = participants.find((participant) =>
			participant.role !== "spectator" && participant.userGuid !== req.body.winnerUserGuid
		);
		if (!loser || !participants.some((participant) => participant.userGuid === req.body.winnerUserGuid)) {
			res.status(400).json({ error: { code: "INVALID_WINNER", message: "Winner must be a match competitor" } });
			return;
		}
		const winnerMmrGain = req.body?.winnerMmrGain;
		const loserMmrLoss = req.body?.loserMmrLoss;
		res.json(await gameplayService.forfeitMatch(
			String(req.params.matchGuid),
			loser.userGuid,
			req.user.guid,
			reason,
			{
				winnerMmrGain: winnerMmrGain === undefined ? undefined : Number(winnerMmrGain),
				loserMmrLoss: loserMmrLoss === undefined ? undefined : Number(loserMmrLoss),
				outcomeKind: "admin_decision",
			},
		));
		return;
	}
	res.status(400).json({ error: { code: "INVALID_DECISION", message: "Supported actions are forfeit, set_health and declare_winner" } });
});

/**
 * @openapi
 * /matches/{matchGuid}/pause:
 *   post:
 *     tags: [Moderation]
 *     summary: "Pause a match"
 *     description: "This endpoint requires an authenticated moderator or administrator."
 *     operationId: postMatchesByMatchGuidPause
 *     security:
 *       - BeatKhanaAuth: []
 *     x-required-roles:
 *       - moderator
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
router.post("/matches/:matchGuid/pause", requireAuth, async (req, res) => {
	if (!req.user?.permissions.some((permission) => ["role:moderator", "role:admin", "role:dev"].includes(permission))) {
		res.status(403).json({ error: { code: "FORBIDDEN", message: "A moderator is required" } });
		return;
	}
	try {
		res.json(await matchService.pause(String(req.params.matchGuid), req.user.guid));
	} catch (error) {
		res.status(409).json({ error: { code: "MATCH_NOT_PAUSABLE", message: error instanceof Error ? error.message : "Match cannot be paused" } });
	}
});

/**
 * @openapi
 * /matches/{matchGuid}/resume:
 *   post:
 *     tags: [Moderation]
 *     summary: "Resume a paused match"
 *     description: "This endpoint requires an authenticated moderator or administrator."
 *     operationId: postMatchesByMatchGuidResume
 *     security:
 *       - BeatKhanaAuth: []
 *     x-required-roles:
 *       - moderator
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
router.post("/matches/:matchGuid/resume", requireAuth, async (req, res) => {
	if (!req.user?.permissions.some((permission) => ["role:moderator", "role:admin", "role:dev"].includes(permission))) {
		res.status(403).json({ error: { code: "FORBIDDEN", message: "A moderator is required" } });
		return;
	}
	try {
		res.json(await matchService.resume(String(req.params.matchGuid), req.user.guid));
	} catch (error) {
		res.status(409).json({ error: { code: "MATCH_NOT_PAUSED", message: error instanceof Error ? error.message : "Match cannot be resumed" } });
	}
});

/**
 * @openapi
 * /matches/{matchGuid}/undo-result:
 *   post:
 *     tags: [Moderation]
 *     summary: "Undo a completed match result"
 *     description: "This endpoint requires an authenticated administrator."
 *     operationId: postMatchesByMatchGuidUndoResult
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
router.post("/matches/:matchGuid/undo-result", requireAuth, async (req, res) => {
	if (!req.user?.permissions.some((permission) => ["role:admin", "role:dev"].includes(permission))) {
		res.status(403).json({ error: { code: "FORBIDDEN", message: "An administrator is required" } });
		return;
	}
	try {
		await revertMatchResult(String(req.params.matchGuid));
		res.json({ reverted: true });
	} catch (error) {
		res.status(409).json({
			error: {
				code: "MATCH_NOT_REVERTIBLE",
				message: error instanceof Error ? error.message : "Match result cannot be reverted",
			},
		});
	}
});

/**
 * @openapi
 * /matches/{matchGuid}/result:
 *   patch:
 *     tags: [Moderation]
 *     summary: Correct the final MMR changes of a completed match
 *     security: [{ BeatKhanaAuth: [] }]
 *     x-required-roles: [admin]
 *     parameters:
 *       - in: path
 *         name: matchGuid
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [winnerMmrGain, loserMmrLoss]
 *             properties:
 *               winnerMmrGain: { type: integer, minimum: 0 }
 *               loserMmrLoss: { type: integer, minimum: 0 }
 *     responses:
 *       200: { description: The stored result and both current ratings were corrected. }
 *       400: { description: Invalid MMR values. }
 *       403: { description: Administrator permission is required. }
 *       409: { description: The match cannot have its MMR result corrected. }
 */
router.patch("/matches/:matchGuid/result", requireAuth, async (req, res) => {
	if (!req.user?.permissions.some((permission) => ["role:admin", "role:dev"].includes(permission))) {
		res.status(403).json({ error: { code: "FORBIDDEN", message: "An administrator is required" } });
		return;
	}
	const winnerMmrGain = req.body?.winnerMmrGain;
	const loserMmrLoss = req.body?.loserMmrLoss;
	if (!Number.isInteger(winnerMmrGain) || winnerMmrGain < 0 || !Number.isInteger(loserMmrLoss) || loserMmrLoss < 0) {
		res.status(400).json({ error: { code: "INVALID_MMR_CHANGE", message: "MMR changes must be non-negative integers" } });
		return;
	}
	try {
		const corrected = await db.transaction(async (tx) => {
			const match = await tx.query.matches.findFirst({
				where: eq(matches.guid, String(req.params.matchGuid)),
				with: { participants: true },
			});
			if (!match || match.status !== "completed" || !match.competitive || !match.seasonGuid || !match.winnerUserGuid || match.undone) {
				throw new Error("Only an active competitive result with a winner can be corrected");
			}
			const winner = match.participants.find((participant) => participant.userGuid === match.winnerUserGuid);
			const loser = match.participants.find((participant) => participant.role !== "spectator" && participant.userGuid !== match.winnerUserGuid);
			if (!winner || !loser) throw new Error("The result participants are incomplete");
			const winnerDelta = winnerMmrGain - (match.winnerMmrGain ?? 0);
			const loserDelta = loserMmrLoss - (match.loserMmrLoss ?? 0);
			await tx.update(competitiveStatistics).set({
				currentMmr: sql`GREATEST(0, ${competitiveStatistics.currentMmr} + ${winnerDelta})`,
				updatedAt: new Date(),
			}).where(and(eq(competitiveStatistics.seasonGuid, match.seasonGuid), eq(competitiveStatistics.userGuid, winner.userGuid)));
			await tx.update(competitiveStatistics).set({
				currentMmr: sql`GREATEST(0, ${competitiveStatistics.currentMmr} - ${loserDelta})`,
				updatedAt: new Date(),
			}).where(and(eq(competitiveStatistics.seasonGuid, match.seasonGuid), eq(competitiveStatistics.userGuid, loser.userGuid)));
			await tx.update(matchParticipants).set({
				finalMmr: winner.initialMmr + winnerMmrGain,
			}).where(eq(matchParticipants.guid, winner.guid));
			await tx.update(matchParticipants).set({
				finalMmr: Math.max(0, loser.initialMmr - loserMmrLoss),
			}).where(eq(matchParticipants.guid, loser.guid));
			const [updated] = await tx.update(matches).set({
				winnerMmrGain,
				loserMmrLoss,
				updatedAt: new Date(),
			}).where(eq(matches.guid, match.guid)).returning();
			return updated;
		});
		res.json(corrected);
	} catch (error) {
		res.status(409).json({ error: { code: "MATCH_RESULT_NOT_CORRECTABLE", message: error instanceof Error ? error.message : "The result cannot be corrected" } });
	}
});

/**
 * @openapi
 * /users/{userGuid}/timeouts:
 *   get:
 *     tags: [Moderation]
 *     summary: List a user's timeout history
 *     security: [{ BeatKhanaAuth: [] }]
 *     x-required-roles: [moderator, admin, dev]
 *     parameters:
 *       - in: path
 *         name: userGuid
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Timeout history ordered newest first. }
 *       403: { description: Moderator permission is required. }
 *   post:
 *     tags: [Moderation]
 *     summary: Temporarily prevent a user from queueing
 *     security: [{ BeatKhanaAuth: [] }]
 *     x-required-roles: [moderator, admin, dev]
 *     parameters:
 *       - in: path
 *         name: userGuid
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [reason]
 *             properties:
 *               durationMinutes: { type: integer, minimum: 1, description: Use this for the 10, 30, 60, 1440 and 10080 minute presets. }
 *               endsAt: { type: string, format: date-time, description: Custom timeout end. }
 *               reason: { type: string }
 *     responses:
 *       201: { description: Timeout created and any queue entry removed. }
 *       400: { description: Timeout duration or reason is invalid. }
 *       403: { description: Moderator permission is required. }
 */
router.get("/users/:userGuid/timeouts", requireAuth, async (req, res) => {
	if (!req.user?.permissions.some((permission) => ["role:moderator", "role:admin", "role:dev"].includes(permission))) {
		res.status(403).json({ error: { code: "FORBIDDEN", message: "A moderator is required" } });
		return;
	}
	res.json(await db.query.userModerationActions.findMany({
		where: and(
			eq(userModerationActions.userGuid, String(req.params.userGuid)),
			eq(userModerationActions.action, "timeout"),
		),
		orderBy: (table, { desc }) => desc(table.createdAt),
		with: { moderator: true, revokedBy: true },
	}));
});

router.post("/users/:userGuid/timeouts", requireAuth, async (req, res) => {
	if (!req.user?.permissions.some((permission) => ["role:moderator", "role:admin", "role:dev"].includes(permission))) {
		res.status(403).json({ error: { code: "FORBIDDEN", message: "A moderator is required" } });
		return;
	}
	const durationMinutes = Number(req.body?.durationMinutes);
	const endsAt = typeof req.body?.endsAt === "string"
		? new Date(req.body.endsAt)
		: Number.isInteger(durationMinutes) && durationMinutes > 0
			? new Date(Date.now() + durationMinutes * 60_000)
			: new Date(Number.NaN);
	try {
		const timeout = await moderationService.timeoutUser(
			String(req.params.userGuid),
			req.user.guid,
			endsAt,
			typeof req.body?.reason === "string" ? req.body.reason : "",
		);
		await db.delete(queuedPlayers).where(eq(queuedPlayers.userGuid, String(req.params.userGuid)));
		res.status(201).json(timeout);
	} catch (error) {
		const status = error instanceof Error && "status" in error ? Number(error.status) : 400;
		res.status(status).json({ error: { code: "TIMEOUT_NOT_CREATED", message: error instanceof Error ? error.message : "Timeout could not be created" } });
	}
});

/**
 * @openapi
 * /users/{userGuid}/timeouts/active:
 *   delete:
 *     tags: [Moderation]
 *     summary: Remove all active timeouts from a user
 *     security: [{ BeatKhanaAuth: [] }]
 *     x-required-roles: [moderator, admin, dev]
 *     parameters:
 *       - in: path
 *         name: userGuid
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Active timeouts revoked. }
 *       403: { description: Moderator permission is required. }
 */
router.delete("/users/:userGuid/timeouts/active", requireAuth, async (req, res) => {
	if (!req.user?.permissions.some((permission) => ["role:moderator", "role:admin", "role:dev"].includes(permission))) {
		res.status(403).json({ error: { code: "FORBIDDEN", message: "A moderator is required" } });
		return;
	}
	res.json({ revoked: await moderationService.removeTimeouts(String(req.params.userGuid), req.user.guid) });
});

/**
 * @openapi
 * /users/{userGuid}/ban:
 *   put:
 *     tags: [Moderation]
 *     summary: Permanently ban a user from matchmaking
 *     security: [{ BeatKhanaAuth: [] }]
 *     x-required-roles: [moderator, admin, dev]
 *     parameters:
 *       - in: path
 *         name: userGuid
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [reason]
 *             properties: { reason: { type: string } }
 *     responses:
 *       200: { description: User banned and removed from queue. }
 *       403: { description: Moderator permission is required. }
 *   delete:
 *     tags: [Moderation]
 *     summary: Remove a permanent matchmaking ban
 *     security: [{ BeatKhanaAuth: [] }]
 *     x-required-roles: [moderator, admin, dev]
 *     parameters:
 *       - in: path
 *         name: userGuid
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: User ban removed. }
 *       403: { description: Moderator permission is required. }
 */
router.put("/users/:userGuid/ban", requireAuth, async (req, res) => {
	if (!req.user?.permissions.some((permission) => ["role:moderator", "role:admin", "role:dev"].includes(permission))) {
		res.status(403).json({ error: { code: "FORBIDDEN", message: "A moderator is required" } });
		return;
	}
	const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
	if (!reason) {
		res.status(400).json({ error: { code: "REASON_REQUIRED", message: "A ban reason is required" } });
		return;
	}
	const result = await db.transaction(async (tx) => {
		const [user] = await tx.update(users).set({ banned: true, updatedAt: new Date() })
			.where(eq(users.guid, String(req.params.userGuid))).returning();
		if (!user) return null;
		await tx.insert(userModerationActions).values({
			userGuid: user.guid,
			moderatorUserGuid: req.user!.guid,
			action: "ban",
			reason,
		});
		await tx.delete(queuedPlayers).where(eq(queuedPlayers.userGuid, user.guid));
		return user;
	});
	if (!result) {
		res.status(404).json({ error: { code: "USER_NOT_FOUND", message: "User does not exist" } });
		return;
	}
	res.json(result);
});

router.delete("/users/:userGuid/ban", requireAuth, async (req, res) => {
	if (!req.user?.permissions.some((permission) => ["role:moderator", "role:admin", "role:dev"].includes(permission))) {
		res.status(403).json({ error: { code: "FORBIDDEN", message: "A moderator is required" } });
		return;
	}
	const [user] = await db.update(users).set({ banned: false, updatedAt: new Date() })
		.where(eq(users.guid, String(req.params.userGuid))).returning();
	if (!user) {
		res.status(404).json({ error: { code: "USER_NOT_FOUND", message: "User does not exist" } });
		return;
	}
	await db.update(userModerationActions).set({
		revokedAt: new Date(),
		revokedByUserGuid: req.user.guid,
	}).where(and(
		eq(userModerationActions.userGuid, user.guid),
		eq(userModerationActions.action, "ban"),
		isNull(userModerationActions.revokedAt),
	));
	res.json(user);
});

export default router;
