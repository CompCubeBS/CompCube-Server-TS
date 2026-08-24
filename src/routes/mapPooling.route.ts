import { Router } from "express";

const router = Router();

/**
 * @openapi
 * /queue/create-batch:
 *   put:
 *     tags: [Map Pooling]
 *     summary: "Move queued maps into a pooling batch"
 *     description: "This endpoint requires the configured map-pool secret. The route is registered now and intentionally returns 404 Not Implemented until its service logic is added."
 *     operationId: putQueueCreateBatch
 *     security:
 *       - PoolSecret: []
 *     parameters:
 *       - in: query
 *         name: count
 *         required: false
 *         description: "Optional count query value."
 *         schema:
 *           type: string
 *       - in: query
 *         name: batch
 *         required: false
 *         description: "Optional batch query value."
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
 *       404:
 *         description: The endpoint is registered but its implementation is not available yet.
 *         content:
 *           text/plain:
 *             schema:
 *               type: string
 *               example: Not Implemented
 */
router.put("/queue/create-batch", (req, res) => {
	res.status(404).type("text/plain").send("Not Implemented");
});

/**
 * @openapi
 * /queue:
 *   get:
 *     tags: [Map Pooling]
 *     summary: "Get maps waiting for pooling"
 *     description: "This endpoint requires the configured map-pool secret. The route is registered now and intentionally returns 404 Not Implemented until its service logic is added."
 *     operationId: getQueue
 *     security:
 *       - PoolSecret: []
 *     responses:
 *       404:
 *         description: The endpoint is registered but its implementation is not available yet.
 *         content:
 *           text/plain:
 *             schema:
 *               type: string
 *               example: Not Implemented
 */
router.get("/queue", (req, res) => {
	res.status(404).type("text/plain").send("Not Implemented");
});

export default router;

