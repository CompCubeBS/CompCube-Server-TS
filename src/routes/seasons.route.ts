import { Router } from "express";
import { and, eq, gt, isNull, lte, or } from "drizzle-orm";
import { db } from "../../db/db";
import { competitiveStatistics, seasons } from "../../db/schema";
import { requireAuth } from "../middleware/auth.middleware";

const router = Router();

/**
 * @openapi
 * /seasons/current:
 *   get:
 *     tags: [Seasons]
 *     summary: "Get the active competitive season"
 *     description: "This endpoint is public."
 *     operationId: getSeasonsCurrent
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
router.get("/seasons/current", async (_req, res) => {
	const now = new Date();
	const season = await db.query.seasons.findFirst({
		where: and(
			eq(seasons.isCurrent, true),
			lte(seasons.startsAt, now),
			or(isNull(seasons.endsAt), gt(seasons.endsAt, now)),
		),
		with: { pools: true },
	});
	if (!season) {
		res.status(404).json({ error: { code: "SEASON_NOT_FOUND", message: "No season is currently active" } });
		return;
	}
	res.json(season);
});

/**
 * @openapi
 * /seasons/{seasonGuid}/finish:
 *   post:
 *     tags: [Seasons]
 *     summary: "Finish the current competitive season"
 *     description: "This endpoint requires an authenticated administrator."
 *     operationId: postSeasonsBySeasonGuidFinish
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
router.post("/seasons/:seasonGuid/finish", requireAuth, async (req, res) => {
	if (!req.user?.permissions.some((permission) => ["role:admin", "role:dev"].includes(permission))) {
		res.status(403).json({ error: { code: "FORBIDDEN", message: "An administrator is required" } });
		return;
	}
	const endedAt = new Date();
	const seasonGuid = String(req.params.seasonGuid);
	const season = await db.transaction(async (tx) => {
		const [updated] = await tx
			.update(seasons)
			.set({ endsAt: endedAt, isCurrent: false, updatedAt: endedAt })
			.where(eq(seasons.guid, seasonGuid))
			.returning();
		if (updated) {
			await tx
				.update(competitiveStatistics)
				.set({ endingMmr: competitiveStatistics.currentMmr, updatedAt: endedAt })
				.where(eq(competitiveStatistics.seasonGuid, seasonGuid));
		}
		return updated;
	});
	if (!season) {
		res.status(404).json({ error: { code: "SEASON_NOT_FOUND", message: "Season does not exist" } });
		return;
	}
	res.json(season);
});

/**
 * @openapi
 * /seasons:
 *   get:
 *     tags: [Seasons]
 *     summary: "List competitive seasons"
 *     description: "This endpoint is public."
 *     operationId: getSeasons
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
router.get("/seasons", async (_req, res) => {
	res.json(await db.query.seasons.findMany({
		with: { pools: true },
	}));
});

/**
 * @openapi
 * /seasons:
 *   post:
 *     tags: [Seasons]
 *     summary: "Create a competitive season"
 *     description: "This endpoint requires an authenticated administrator."
 *     operationId: postSeasons
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
router.post("/seasons", requireAuth, async (req, res) => {
	if (!req.user?.permissions.some((permission) => ["role:admin", "role:dev"].includes(permission))) {
		res.status(403).json({ error: { code: "FORBIDDEN", message: "An administrator is required" } });
		return;
	}
	const { id, name, startsAt, endsAt, description, isCurrent, startingMmr } = req.body as Record<string, unknown>;
	if (typeof id !== "string" || typeof name !== "string" || typeof startsAt !== "string") {
		res.status(400).json({ error: { code: "INVALID_SEASON", message: "id, name and startsAt are required" } });
		return;
	}
	if (startingMmr !== undefined && (!Number.isInteger(startingMmr) || Number(startingMmr) < 0)) {
		res.status(400).json({ error: { code: "INVALID_STARTING_MMR", message: "startingMmr must be a non-negative integer" } });
		return;
	}
	try {
		const [created] = await db
			.insert(seasons)
			.values({
				id,
				name,
				description: typeof description === "string" ? description : null,
				isCurrent: isCurrent === true,
				startingMmr: startingMmr === undefined ? 1000 : Number(startingMmr),
				startsAt: new Date(startsAt),
				endsAt: typeof endsAt === "string" ? new Date(endsAt) : null,
			})
			.returning();
		res.status(201).json(created);
	} catch {
		res.status(409).json({ error: { code: "SEASON_CONFLICT", message: "The season overlaps another season or violates a unique constraint" } });
	}
});

/**
 * @openapi
 * /seasons/{seasonGuid}:
 *   get:
 *     tags: [Seasons]
 *     summary: "Get a competitive season"
 *     description: "This endpoint is public."
 *     operationId: getSeasonsBySeasonGuid
 *     parameters:
 *       - in: path
 *         name: seasonGuid
 *         required: true
 *         description: "Identifies the seasonGuid resource."
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
router.get("/seasons/:seasonGuid", async (req, res) => {
	const season = await db.query.seasons.findFirst({
		where: eq(seasons.guid, String(req.params.seasonGuid)),
		with: { pools: true },
	});
	if (!season) {
		res.status(404).json({ error: { code: "SEASON_NOT_FOUND", message: "Season does not exist" } });
		return;
	}
	res.json(season);
});

/**
 * @openapi
 * /seasons/{seasonGuid}:
 *   patch:
 *     tags: [Seasons]
 *     summary: "Update a competitive season"
 *     description: "This endpoint requires an authenticated administrator."
 *     operationId: patchSeasonsBySeasonGuid
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
router.patch("/seasons/:seasonGuid", requireAuth, async (req, res) => {
	if (!req.user?.permissions.some((permission) => ["role:admin", "role:dev"].includes(permission))) {
		res.status(403).json({ error: { code: "FORBIDDEN", message: "An administrator is required" } });
		return;
	}
	const update: Record<string, unknown> = { updatedAt: new Date() };
	for (const field of ["id", "name", "description", "isCurrent"] as const) {
		if (req.body?.[field] !== undefined) update[field] = req.body[field];
	}
	if (req.body?.startingMmr !== undefined) {
		if (!Number.isInteger(req.body.startingMmr) || req.body.startingMmr < 0) {
			res.status(400).json({ error: { code: "INVALID_STARTING_MMR", message: "startingMmr must be a non-negative integer" } });
			return;
		}
		update.startingMmr = req.body.startingMmr;
	}
	if (req.body?.startsAt !== undefined) update.startsAt = new Date(req.body.startsAt);
	if (req.body?.endsAt !== undefined) update.endsAt = req.body.endsAt === null ? null : new Date(req.body.endsAt);
	try {
		const [updated] = await db.update(seasons).set(update).where(eq(seasons.guid, String(req.params.seasonGuid))).returning();
		if (!updated) {
			res.status(404).json({ error: { code: "SEASON_NOT_FOUND", message: "Season does not exist" } });
			return;
		}
		res.json(updated);
	} catch {
		res.status(409).json({ error: { code: "SEASON_CONFLICT", message: "The season overlaps another season or violates a unique constraint" } });
	}
});

/**
 * @openapi
 * /seasons/{seasonGuid}:
 *   delete:
 *     tags: [Seasons]
 *     summary: "Delete a competitive season"
 *     description: "This endpoint requires an authenticated administrator."
 *     operationId: deleteSeasonsBySeasonGuid
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
router.delete("/seasons/:seasonGuid", requireAuth, async (req, res) => {
	if (!req.user?.permissions.some((permission) => ["role:admin", "role:dev"].includes(permission))) {
		res.status(403).json({ error: { code: "FORBIDDEN", message: "An administrator is required" } });
		return;
	}
	try {
		const removed = await db.delete(seasons).where(eq(seasons.guid, String(req.params.seasonGuid))).returning({ guid: seasons.guid });
		if (!removed.length) {
			res.status(404).json({ error: { code: "SEASON_NOT_FOUND", message: "Season does not exist" } });
			return;
		}
		res.status(204).send();
	} catch {
		res.status(409).json({ error: { code: "SEASON_IN_USE", message: "A season with history cannot be deleted" } });
	}
});

export default router;
