import { Router } from "express";
import { eq } from "drizzle-orm";
import { db } from "../../db/db";
import { matchTimers } from "../../db/schema";
import { requireAuth } from "../middleware/auth.middleware";
import { timerService } from "../services/timer.service";

const router = Router();

/**
 * @openapi
 * /matches/{matchGuid}/timers/{timerGuid}/skip:
 *   post:
 *     tags: [Timers]
 *     summary: "Skip a match timer"
 *     description: "This endpoint requires an authenticated BeatKhana account."
 *     operationId: postMatchesByMatchGuidTimersByTimerGuidSkip
 *     security:
 *       - BeatKhanaAuth: []
 *     parameters:
 *       - in: path
 *         name: matchGuid
 *         required: true
 *         description: "Identifies the matchGuid resource."
 *         schema:
 *           type: string
 *       - in: path
 *         name: timerGuid
 *         required: true
 *         description: "Identifies the timerGuid resource."
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
router.post("/matches/:matchGuid/timers/:timerGuid/skip", requireAuth, async (req, res) => {
	if (!req.user?.permissions.some((permission) => ["role:moderator", "role:admin", "role:dev"].includes(permission))) {
		res.status(403).json({ error: { code: "FORBIDDEN", message: "A moderator is required" } });
		return;
	}
	res.json({ skipped: await timerService.skip(String(req.params.timerGuid), String(req.params.matchGuid)) });
});

/**
 * @openapi
 * /matches/{matchGuid}/timers:
 *   get:
 *     tags: [Timers]
 *     summary: "List a match's durable timers"
 *     description: "This endpoint requires an authenticated BeatKhana account."
 *     operationId: getMatchesByMatchGuidTimers
 *     security:
 *       - BeatKhanaAuth: []
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
router.get("/matches/:matchGuid/timers", requireAuth, async (req, res) => {
	res.json(await db.query.matchTimers.findMany({
		where: eq(matchTimers.matchGuid, String(req.params.matchGuid)),
	}));
});

/**
 * @openapi
 * /matches/{matchGuid}/timers:
 *   post:
 *     tags: [Timers]
 *     summary: "Schedule a durable match timer"
 *     description: "This endpoint requires an authenticated administrator."
 *     operationId: postMatchesByMatchGuidTimers
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
router.post("/matches/:matchGuid/timers", requireAuth, async (req, res) => {
	if (!req.user?.permissions.some((permission) => ["role:admin", "role:dev"].includes(permission))) {
		res.status(403).json({ error: { code: "FORBIDDEN", message: "An administrator is required" } });
		return;
	}
	if (req.body?.kind !== "custom" || typeof req.body?.dueAt !== "string" || typeof req.body?.idempotencyKey !== "string") {
		res.status(400).json({ error: { code: "INVALID_TIMER", message: "Only custom timers with dueAt and idempotencyKey can be created through REST" } });
		return;
	}
	res.status(201).json(await timerService.schedule({
		matchGuid: String(req.params.matchGuid),
		kind: "custom",
		dueAt: new Date(req.body.dueAt),
		idempotencyKey: req.body.idempotencyKey,
		payload: req.body.payload,
	}));
});

/**
 * @openapi
 * /timers/{timerGuid}:
 *   patch:
 *     tags: [Timers]
 *     summary: "Update a durable timer"
 *     description: "This endpoint requires an authenticated administrator. The route is registered now and intentionally returns 404 Not Implemented until its service logic is added."
 *     operationId: patchTimersByTimerGuid
 *     security:
 *       - BeatKhanaAuth: []
 *     x-required-roles:
 *       - admin
 *     parameters:
 *       - in: path
 *         name: timerGuid
 *         required: true
 *         description: "Identifies the timerGuid resource."
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
 *       404:
 *         description: The endpoint is registered but its implementation is not available yet.
 *         content:
 *           text/plain:
 *             schema:
 *               type: string
 *               example: Not Implemented
 */
router.patch("/timers/:timerGuid", (req, res) => {
	res.status(404).type("text/plain").send("Not Implemented");
});

/**
 * @openapi
 * /timers/{timerGuid}:
 *   delete:
 *     tags: [Timers]
 *     summary: "Cancel a durable timer"
 *     description: "This endpoint requires an authenticated administrator."
 *     operationId: deleteTimersByTimerGuid
 *     security:
 *       - BeatKhanaAuth: []
 *     x-required-roles:
 *       - admin
 *     parameters:
 *       - in: path
 *         name: timerGuid
 *         required: true
 *         description: "Identifies the timerGuid resource."
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
router.delete("/timers/:timerGuid", requireAuth, async (req, res) => {
	if (!req.user?.permissions.some((permission) => ["role:admin", "role:dev"].includes(permission))) {
		res.status(403).json({ error: { code: "FORBIDDEN", message: "An administrator is required" } });
		return;
	}
	const [cancelled] = await db.update(matchTimers).set({
		status: "cancelled",
		updatedAt: new Date(),
	}).where(eq(matchTimers.guid, String(req.params.timerGuid))).returning();
	if (!cancelled) {
		res.status(404).json({ error: { code: "TIMER_NOT_FOUND", message: "Timer does not exist" } });
		return;
	}
	res.json(cancelled);
});

export default router;
