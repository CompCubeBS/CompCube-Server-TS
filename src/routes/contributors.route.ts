import { Router } from "express";
import { arrayContains } from "drizzle-orm";
import { db } from "../../db/db";
import { users } from "../../db/schema";

const router = Router();

/**
 * @openapi
 * /contributors:
 *   get:
 *     tags: [Contributors]
 *     summary: "List project contributors"
 *     description: "This endpoint is public."
 *     operationId: getContributors
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
router.get("/contributors", async (_req, res) => {
	const contributors = await db.query.users.findMany({
		columns: {
			guid: true,
			username: true,
			avatarUrl: true,
			permissions: true,
		},
		where: arrayContains(users.permissions, ["perk:contributor"]),
	});
	res.json(contributors);
});

export default router;
