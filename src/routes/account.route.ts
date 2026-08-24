import { Router } from "express";
import { config } from "../config";
import { requireAuth } from "../middleware/auth.middleware";

const router = Router();

/**
 * @openapi
 * /account/me:
 *   get:
 *     tags: [Accounts]
 *     summary: Return the authenticated CompCube account
 *     security: [{ BeatKhanaAuth: [] }]
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
router.get("/me", requireAuth, (req, res) => {
	const user = req.user!;
	res.json({
		user,
		canQueue: Boolean(user.platformId) && !user.banned,
		linkingUrl: user.platformId ? null : config.beatKhana.linkingUrl,
	});
});

export default router;
