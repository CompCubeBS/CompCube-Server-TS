import { Router } from "express";
import { eq } from "drizzle-orm";
import { db } from "../../db/db";
import { seasonPools } from "../../db/schema";
import { requireAuth } from "../middleware/auth.middleware";

const router = Router();

/**
 * @openapi
 * /seasons/{seasonGuid}/pools:
 *   get:
 *     tags: [Pools]
 *     summary: "List a season's map pools"
 *     description: "This endpoint is public."
 *     operationId: getSeasonsBySeasonGuidPools
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
router.get("/seasons/:seasonGuid/pools", async (req, res) => {
	res.json(await db.query.seasonPools.findMany({
		where: eq(seasonPools.seasonGuid, String(req.params.seasonGuid)),
		with: { maps: true },
	}));
});

/**
 * @openapi
 * /seasons/{seasonGuid}/pools:
 *   post:
 *     tags: [Pools]
 *     summary: "Create a season map pool"
 *     description: "This endpoint requires an authenticated administrator."
 *     operationId: postSeasonsBySeasonGuidPools
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
router.post("/seasons/:seasonGuid/pools", requireAuth, async (req, res) => {
	if (!req.user?.permissions.some((permission) => ["role:admin", "role:dev"].includes(permission))) {
		res.status(403).json({ error: { code: "FORBIDDEN", message: "An administrator is required" } });
		return;
	}
	if (typeof req.body?.name !== "string" || !req.body.name.trim()) {
		res.status(400).json({ error: { code: "INVALID_POOL", message: "name is required" } });
		return;
	}
	try {
		const [created] = await db.insert(seasonPools).values({
			seasonGuid: String(req.params.seasonGuid),
			name: req.body.name.trim(),
			imageUrl: typeof req.body.imageUrl === "string" ? req.body.imageUrl : null,
			isPublic: req.body.isPublic === true,
		}).returning();
		res.status(201).json(created);
	} catch {
		res.status(409).json({ error: { code: "POOL_CONFLICT", message: "The pool could not be created for that season" } });
	}
});

/**
 * @openapi
 * /pools/{poolGuid}:
 *   get:
 *     tags: [Pools]
 *     summary: "Get a map pool"
 *     description: "This endpoint is public."
 *     operationId: getPoolsByPoolGuid
 *     parameters:
 *       - in: path
 *         name: poolGuid
 *         required: true
 *         description: "Identifies the poolGuid resource."
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
router.get("/pools/:poolGuid", async (req, res) => {
	const pool = await db.query.seasonPools.findFirst({
		where: eq(seasonPools.guid, String(req.params.poolGuid)),
		with: { season: true, maps: true, queues: true },
	});
	if (!pool) {
		res.status(404).json({ error: { code: "POOL_NOT_FOUND", message: "Map pool does not exist" } });
		return;
	}
	res.json(pool);
});

/**
 * @openapi
 * /pools/{poolGuid}:
 *   patch:
 *     tags: [Pools]
 *     summary: "Update a map pool"
 *     description: "This endpoint requires an authenticated administrator."
 *     operationId: patchPoolsByPoolGuid
 *     security:
 *       - BeatKhanaAuth: []
 *     x-required-roles:
 *       - admin
 *     parameters:
 *       - in: path
 *         name: poolGuid
 *         required: true
 *         description: "Identifies the poolGuid resource."
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
router.patch("/pools/:poolGuid", requireAuth, async (req, res) => {
	if (!req.user?.permissions.some((permission) => ["role:admin", "role:dev"].includes(permission))) {
		res.status(403).json({ error: { code: "FORBIDDEN", message: "An administrator is required" } });
		return;
	}
	const update: Record<string, unknown> = { updatedAt: new Date() };
	for (const field of ["seasonGuid", "name", "imageUrl", "isPublic"] as const) {
		if (req.body?.[field] !== undefined) update[field] = req.body[field];
	}
	const [updated] = await db.update(seasonPools).set(update).where(eq(seasonPools.guid, String(req.params.poolGuid))).returning();
	if (!updated) {
		res.status(404).json({ error: { code: "POOL_NOT_FOUND", message: "Map pool does not exist" } });
		return;
	}
	res.json(updated);
});

/**
 * @openapi
 * /pools/{poolGuid}:
 *   delete:
 *     tags: [Pools]
 *     summary: "Delete a map pool"
 *     description: "This endpoint requires an authenticated administrator."
 *     operationId: deletePoolsByPoolGuid
 *     security:
 *       - BeatKhanaAuth: []
 *     x-required-roles:
 *       - admin
 *     parameters:
 *       - in: path
 *         name: poolGuid
 *         required: true
 *         description: "Identifies the poolGuid resource."
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
router.delete("/pools/:poolGuid", requireAuth, async (req, res) => {
	if (!req.user?.permissions.some((permission) => ["role:admin", "role:dev"].includes(permission))) {
		res.status(403).json({ error: { code: "FORBIDDEN", message: "An administrator is required" } });
		return;
	}
	try {
		const removed = await db.delete(seasonPools).where(eq(seasonPools.guid, String(req.params.poolGuid))).returning({ guid: seasonPools.guid });
		if (!removed.length) {
			res.status(404).json({ error: { code: "POOL_NOT_FOUND", message: "Map pool does not exist" } });
			return;
		}
		res.status(204).send();
	} catch {
		res.status(409).json({ error: { code: "POOL_IN_USE", message: "A pool used by a queue or match cannot be deleted" } });
	}
});

export default router;
