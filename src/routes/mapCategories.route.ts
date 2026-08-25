import { Router } from "express";
import { eq } from "drizzle-orm";
import { db } from "../../db/db";
import { mapCategories } from "../../db/schema";
import { requireAuth } from "../middleware/auth.middleware";

const router = Router();

/**
 * @openapi
 * /map-categories:
 *   get:
 *     tags: [Map Categories]
 *     summary: "List map categories"
 *     description: "This endpoint is public."
 *     operationId: getMapCategories
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
router.get("/map-categories", async (_req, res) => {
	res.json(await db.query.mapCategories.findMany());
});

/**
 * @openapi
 * /map-categories:
 *   post:
 *     tags: [Map Categories]
 *     summary: "Create a map category"
 *     description: "This endpoint requires an authenticated administrator."
 *     operationId: postMapCategories
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
router.post("/map-categories", requireAuth, async (req, res) => {
	if (!req.user?.permissions.some((permission) => ["role:admin", "role:dev"].includes(permission))) {
		res.status(403).json({ error: { code: "FORBIDDEN", message: "An administrator is required" } });
		return;
	}
	if (typeof req.body?.name !== "string" || !req.body.name.trim()) {
		res.status(400).json({ error: { code: "INVALID_MAP_CATEGORY", message: "name is required" } });
		return;
	}
	try {
		const [created] = await db.insert(mapCategories).values({
			name: req.body.name.trim(),
			imageUrl: typeof req.body.imageUrl === "string" ? req.body.imageUrl : null,
			color: typeof req.body.color === "string" ? req.body.color : null,
		}).returning();
		res.status(201).json(created);
	} catch {
		res.status(409).json({ error: { code: "MAP_CATEGORY_CONFLICT", message: "The category name or color is invalid" } });
	}
});

/**
 * @openapi
 * /map-categories/{categoryGuid}:
 *   get:
 *     tags: [Map Categories]
 *     summary: "Get a map category"
 *     description: "This endpoint is public."
 *     operationId: getMapCategoryByGuid
 *     parameters:
 *       - in: path
 *         name: categoryGuid
 *         required: true
 *         description: "Identifies the categoryGuid resource."
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
router.get("/map-categories/:categoryGuid", async (req, res) => {
	const category = await db.query.mapCategories.findFirst({
		where: eq(mapCategories.guid, String(req.params.categoryGuid)),
	});
	if (!category) {
		res.status(404).json({ error: { code: "MAP_CATEGORY_NOT_FOUND", message: "Map category does not exist" } });
		return;
	}
	res.json(category);
});

/**
 * @openapi
 * /map-categories/{categoryGuid}:
 *   patch:
 *     tags: [Map Categories]
 *     summary: "Update a map category"
 *     description: "This endpoint requires an authenticated administrator."
 *     operationId: updateMapCategory
 *     security:
 *       - BeatKhanaAuth: []
 *     x-required-roles:
 *       - admin
 *     parameters:
 *       - in: path
 *         name: categoryGuid
 *         required: true
 *         description: "Identifies the categoryGuid resource."
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
router.patch("/map-categories/:categoryGuid", requireAuth, async (req, res) => {
	if (!req.user?.permissions.some((permission) => ["role:admin", "role:dev"].includes(permission))) {
		res.status(403).json({ error: { code: "FORBIDDEN", message: "An administrator is required" } });
		return;
	}
	const update: Record<string, unknown> = {};
	for (const field of ["name", "imageUrl", "color"] as const) {
		if (req.body?.[field] !== undefined) update[field] = req.body[field];
	}
	const [updated] = await db.update(mapCategories).set(update).where(eq(mapCategories.guid, String(req.params.categoryGuid))).returning();
	if (!updated) {
		res.status(404).json({ error: { code: "MAP_CATEGORY_NOT_FOUND", message: "Map category does not exist" } });
		return;
	}
	res.json(updated);
});

/**
 * @openapi
 * /map-categories/{categoryGuid}:
 *   delete:
 *     tags: [Map Categories]
 *     summary: "Delete a map category"
 *     description: "This endpoint requires an authenticated administrator."
 *     operationId: deleteMapCategory
 *     security:
 *       - BeatKhanaAuth: []
 *     x-required-roles:
 *       - admin
 *     parameters:
 *       - in: path
 *         name: categoryGuid
 *         required: true
 *         description: "Identifies the categoryGuid resource."
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
router.delete("/map-categories/:categoryGuid", requireAuth, async (req, res) => {
	if (!req.user?.permissions.some((permission) => ["role:admin", "role:dev"].includes(permission))) {
		res.status(403).json({ error: { code: "FORBIDDEN", message: "An administrator is required" } });
		return;
	}
	const removed = await db.delete(mapCategories).where(eq(mapCategories.guid, String(req.params.categoryGuid))).returning({ guid: mapCategories.guid });
	if (!removed.length) {
		res.status(404).json({ error: { code: "MAP_CATEGORY_NOT_FOUND", message: "Map category does not exist" } });
		return;
	}
	res.status(204).send();
});

export default router;
