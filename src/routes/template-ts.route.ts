import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware";

const router = Router();

/**
 * @openapi
 * /function_here:
 *   get:
 *     summary: Reserved authenticated endpoint template
 *     deprecated: true
 *     tags: [Internal]
 *     security:
 *       - BeatKhanaAuth: []
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
router.get("/function_here", requireAuth, (req, res) => res.status(204).send());

export default router;
