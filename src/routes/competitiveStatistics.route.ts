import { Router } from "express";
import { and, eq } from "drizzle-orm";
import { db } from "../../db/db";
import { competitiveStatistics } from "../../db/schema";
import { requireAuth } from "../middleware/auth.middleware";

const router = Router();

/**
 * @openapi
 * /users/{userGuid}/statistics:
 *   get:
 *     tags: [Competitive Statistics]
 *     summary: "List a user's seasonal statistics"
 *     description: "This endpoint is public."
 *     operationId: getUsersByUserGuidStatistics
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
router.get("/users/:userGuid/statistics", async (req, res) => {
	res.json(
		await db.query.competitiveStatistics.findMany({
			where: eq(competitiveStatistics.userGuid, String(req.params.userGuid)),
			with: { season: true },
		}),
	);
});

/**
 * @openapi
 * /seasons/{seasonGuid}/statistics/{userGuid}:
 *   get:
 *     tags: [Competitive Statistics]
 *     summary: "Get one user's season statistics"
 *     description: "This endpoint is public."
 *     operationId: getSeasonsBySeasonGuidStatisticsByUserGuid
 *     parameters:
 *       - in: path
 *         name: seasonGuid
 *         required: true
 *         description: "Identifies the seasonGuid resource."
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
router.get("/seasons/:seasonGuid/statistics/:userGuid", async (req, res) => {
	const statistics = await db.query.competitiveStatistics.findFirst({
		where: and(
			eq(competitiveStatistics.seasonGuid, String(req.params.seasonGuid)),
			eq(competitiveStatistics.userGuid, String(req.params.userGuid)),
		),
		with: { season: true, user: true },
	});
	if (!statistics) {
		res.status(404).json({ error: { code: "STATISTICS_NOT_FOUND", message: "Season statistics do not exist" } });
		return;
	}
	res.json(statistics);
});

/**
 * @openapi
 * /seasons/{seasonGuid}/statistics/{userGuid}:
 *   patch:
 *     tags: [Competitive Statistics]
 *     summary: "Adjust one user's season statistics"
 *     description: "This endpoint requires an authenticated administrator."
 *     operationId: patchSeasonsBySeasonGuidStatisticsByUserGuid
 *     security:
 *       - BeatKhanaAuth: []
 *     x-required-roles:
 *       - admin
 *     parameters:
 *       - in: path
 *         name: seasonGuid
 *         required: true
 *         description: "Identifies the seasonGuid resource."
 *         schema:
 *           type: string
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
router.patch("/seasons/:seasonGuid/statistics/:userGuid", requireAuth, async (req, res) => {
	if (!req.user?.permissions.some((permission) => ["role:admin", "role:dev"].includes(permission))) {
		res.status(403).json({ error: { code: "FORBIDDEN", message: "An administrator is required" } });
		return;
	}
	const update: Record<string, unknown> = { updatedAt: new Date() };
	for (const field of [
		"currentMmr", "startingMmr", "endingMmr", "wins", "totalGames", "winStreak", "bestWinStreak",
	] as const) {
		if (req.body?.[field] !== undefined) update[field] = req.body[field];
	}
	const [statistics] = await db
		.update(competitiveStatistics)
		.set(update)
		.where(and(
			eq(competitiveStatistics.seasonGuid, String(req.params.seasonGuid)),
			eq(competitiveStatistics.userGuid, String(req.params.userGuid)),
		))
		.returning();
	if (!statistics) {
		res.status(404).json({ error: { code: "STATISTICS_NOT_FOUND", message: "Season statistics do not exist" } });
		return;
	}
	res.json(statistics);
});

export default router;
