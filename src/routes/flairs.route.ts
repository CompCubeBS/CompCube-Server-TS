import { Router } from "express";
import { eq } from "drizzle-orm";
import { db } from "../../db/db";
import { flairs } from "../../db/schema";
import { requireAuth } from "../middleware/auth.middleware";

const router = Router();

/**
 * @openapi
 * /flairs:
 *   get:
 *     tags: [Flairs]
 *     summary: "List map flairs"
 *     description: "This endpoint is public."
 *     operationId: getFlairs
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
router.get("/flairs", async (_req, res) => {
	res.json(await db.query.flairs.findMany());
});

/**
 * @openapi
 * /flairs:
 *   post:
 *     tags: [Flairs]
 *     summary: "Create a map flair"
 *     description: "This endpoint requires an authenticated administrator."
 *     operationId: postFlairs
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
router.post("/flairs", requireAuth, async (req, res) => {
	if (!req.user?.permissions.some((permission) => ["role:admin", "role:dev"].includes(permission))) {
		res.status(403).json({ error: { code: "FORBIDDEN", message: "An administrator is required" } });
		return;
	}
	if (typeof req.body?.name !== "string" || !req.body.name.trim()) {
		res.status(400).json({ error: { code: "INVALID_FLAIR", message: "name is required" } });
		return;
	}
	try {
		const [created] = await db.insert(flairs).values({
			name: req.body.name.trim(),
			imageUrl: typeof req.body.imageUrl === "string" ? req.body.imageUrl : null,
			color: typeof req.body.color === "string" ? req.body.color : null,
		}).returning();
		res.status(201).json(created);
	} catch {
		res.status(409).json({ error: { code: "FLAIR_CONFLICT", message: "The flair name or color is invalid" } });
	}
});

/**
 * @openapi
 * /flairs/{flairGuid}:
 *   get:
 *     tags: [Flairs]
 *     summary: "Get a map flair"
 *     description: "This endpoint is public."
 *     operationId: getFlairsByFlairGuid
 *     parameters:
 *       - in: path
 *         name: flairGuid
 *         required: true
 *         description: "Identifies the flairGuid resource."
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
router.get("/flairs/:flairGuid", async (req, res) => {
	const flair = await db.query.flairs.findFirst({
		where: eq(flairs.guid, String(req.params.flairGuid)),
	});
	if (!flair) {
		res.status(404).json({ error: { code: "FLAIR_NOT_FOUND", message: "Flair does not exist" } });
		return;
	}
	res.json(flair);
});

/**
 * @openapi
 * /flairs/{flairGuid}:
 *   patch:
 *     tags: [Flairs]
 *     summary: "Update a map flair"
 *     description: "This endpoint requires an authenticated administrator."
 *     operationId: patchFlairsByFlairGuid
 *     security:
 *       - BeatKhanaAuth: []
 *     x-required-roles:
 *       - admin
 *     parameters:
 *       - in: path
 *         name: flairGuid
 *         required: true
 *         description: "Identifies the flairGuid resource."
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
router.patch("/flairs/:flairGuid", requireAuth, async (req, res) => {
	if (!req.user?.permissions.some((permission) => ["role:admin", "role:dev"].includes(permission))) {
		res.status(403).json({ error: { code: "FORBIDDEN", message: "An administrator is required" } });
		return;
	}
	const update: Record<string, unknown> = {};
	for (const field of ["name", "imageUrl", "color"] as const) {
		if (req.body?.[field] !== undefined) update[field] = req.body[field];
	}
	const [updated] = await db.update(flairs).set(update).where(eq(flairs.guid, String(req.params.flairGuid))).returning();
	if (!updated) {
		res.status(404).json({ error: { code: "FLAIR_NOT_FOUND", message: "Flair does not exist" } });
		return;
	}
	res.json(updated);
});

/**
 * @openapi
 * /flairs/{flairGuid}:
 *   delete:
 *     tags: [Flairs]
 *     summary: "Delete a map flair"
 *     description: "This endpoint requires an authenticated administrator."
 *     operationId: deleteFlairsByFlairGuid
 *     security:
 *       - BeatKhanaAuth: []
 *     x-required-roles:
 *       - admin
 *     parameters:
 *       - in: path
 *         name: flairGuid
 *         required: true
 *         description: "Identifies the flairGuid resource."
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
router.delete("/flairs/:flairGuid", requireAuth, async (req, res) => {
	if (!req.user?.permissions.some((permission) => ["role:admin", "role:dev"].includes(permission))) {
		res.status(403).json({ error: { code: "FORBIDDEN", message: "An administrator is required" } });
		return;
	}
	const removed = await db.delete(flairs).where(eq(flairs.guid, String(req.params.flairGuid))).returning({ guid: flairs.guid });
	if (!removed.length) {
		res.status(404).json({ error: { code: "FLAIR_NOT_FOUND", message: "Flair does not exist" } });
		return;
	}
	res.status(204).send();
});

export default router;
