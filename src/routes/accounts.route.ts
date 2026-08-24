import { Router } from "express";

const router = Router();

/**
 * @openapi
 * /account/link-platform:
 *   post:
 *     tags: [Accounts]
 *     summary: "Refresh the platform ID from the game plugin"
 *     description: "This endpoint requires an authenticated BeatKhana account. The route is registered now and intentionally returns 404 Not Implemented until its service logic is added."
 *     operationId: postAccountLinkPlatform
 *     security:
 *       - BeatKhanaAuth: []
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
router.post("/account/link-platform", (req, res) => {
	res.status(404).type("text/plain").send("Not Implemented");
});

/**
 * @openapi
 * /account/me:
 *   patch:
 *     tags: [Accounts]
 *     summary: "Update the authenticated account"
 *     description: "This endpoint requires an authenticated BeatKhana account. The route is registered now and intentionally returns 404 Not Implemented until its service logic is added."
 *     operationId: patchAccountMe
 *     security:
 *       - BeatKhanaAuth: []
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
router.patch("/account/me", (req, res) => {
	res.status(404).type("text/plain").send("Not Implemented");
});

/**
 * @openapi
 * /account/me:
 *   delete:
 *     tags: [Accounts]
 *     summary: "Delete the authenticated account"
 *     description: "This endpoint requires an authenticated BeatKhana account. The route is registered now and intentionally returns 404 Not Implemented until its service logic is added."
 *     operationId: deleteAccountMe
 *     security:
 *       - BeatKhanaAuth: []
 *     responses:
 *       404:
 *         description: The endpoint is registered but its implementation is not available yet.
 *         content:
 *           text/plain:
 *             schema:
 *               type: string
 *               example: Not Implemented
 */
router.delete("/account/me", (req, res) => {
	res.status(404).type("text/plain").send("Not Implemented");
});

export default router;

