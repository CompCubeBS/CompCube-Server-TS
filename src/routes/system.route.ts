import { Router } from "express";
import { config } from "../config";

const router = Router();

/**
 * @openapi
 * /health:
 *   get:
 *     tags: [System]
 *     summary: Process health probe
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
router.get("/health", (req, res) =>
	res.json({ ok: true, time: new Date().toISOString() })
);

/**
 * @openapi
 * /server/status:
 *   get:
 *     tags: [System]
 *     summary: "Get the public game-server status"
 *     description: "Returns service availability and the plugin versions accepted by both Socket.IO and replay publishing. An empty version list accepts development builds."
 *     operationId: getServerStatus
 *     responses:
 *       200:
 *         description: Current public server and plugin compatibility state.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, example: online }
 *                 supportedPluginVersions:
 *                   type: array
 *                   items: { type: string }
 *                 time: { type: string, format: date-time }
 */
router.get("/server/status", (_req, res) => {
	res.json({
		status: "online",
		state: 0,
		allowedGameVersions: [],
		allowedModVersions: config.pluginVersions,
		supportedPluginVersions: config.pluginVersions,
		time: new Date().toISOString(),
	});
});

export default router;
