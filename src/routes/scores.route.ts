import { Router } from "express";
import { and, eq } from "drizzle-orm";
import { db } from "../../db/db";
import { matchRounds, matchScores } from "../../db/schema";
import { requireAuth } from "../middleware/auth.middleware";

const router = Router();

/**
 * @openapi
 * /matches/{matchGuid}/rounds/{roundGuid}/scores:
 *   get:
 *     tags: [Scores]
 *     summary: "List submitted round scores"
 *     description: "Public score details for both players in a completed or active round."
 *     operationId: getMatchesByMatchGuidRoundsByRoundGuidScores
 *     parameters:
 *       - in: path
 *         name: matchGuid
 *         required: true
 *         description: "Identifies the matchGuid resource."
 *         schema:
 *           type: string
 *       - in: path
 *         name: roundGuid
 *         required: true
 *         description: "Identifies the roundGuid resource."
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
router.get("/matches/:matchGuid/rounds/:roundGuid/scores", async (req, res) => {
	const round = await db.query.matchRounds.findFirst({
		columns: { guid: true },
		where: and(
			eq(matchRounds.matchGuid, String(req.params.matchGuid)),
			eq(matchRounds.guid, String(req.params.roundGuid)),
		),
		with: { scores: { with: { user: true } } },
	});
	if (!round) {
		res.status(404).json({ error: { code: "ROUND_NOT_FOUND", message: "Match round does not exist" } });
		return;
	}
	res.json(round.scores);
});

/**
 * @openapi
 * /matches/{matchGuid}/rounds/{roundGuid}/scores:
 *   post:
 *     tags: [Scores]
 *     summary: "Submit the authenticated player's score"
 *     description: "This endpoint requires an authenticated BeatKhana account."
 *     operationId: postMatchesByMatchGuidRoundsByRoundGuidScores
 *     security:
 *       - BeatKhanaAuth: []
 *     parameters:
 *       - in: path
 *         name: matchGuid
 *         required: true
 *         description: "Identifies the matchGuid resource."
 *         schema:
 *           type: string
 *       - in: path
 *         name: roundGuid
 *         required: true
 *         description: "Identifies the roundGuid resource."
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
 *       405:
 *         description: Queue and match gameplay changes must be sent over the authenticated websocket.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiError'
 */
router.post("/matches/:matchGuid/rounds/:roundGuid/scores", (_req, res) => {
	res.status(405).json({
		error: {
			code: "SOCKET_ONLY",
			message: "Submit scores through the authenticated submitScore socket packet",
		},
	});
});

/**
 * @openapi
 * /scores/{scoreGuid}:
 *   patch:
 *     tags: [Scores]
 *     summary: "Correct a submitted score"
 *     description: "This endpoint requires an authenticated moderator or administrator. The route is registered now and intentionally returns 404 Not Implemented until its service logic is added."
 *     operationId: patchScoresByScoreGuid
 *     security:
 *       - BeatKhanaAuth: []
 *     x-required-roles:
 *       - moderator
 *       - admin
 *     parameters:
 *       - in: path
 *         name: scoreGuid
 *         required: true
 *         description: "Identifies the scoreGuid resource."
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
router.patch("/scores/:scoreGuid", (req, res) => {
	res.status(404).type("text/plain").send("Not Implemented");
});

/**
 * @openapi
 * /scores/{scoreGuid}:
 *   delete:
 *     tags: [Scores]
 *     summary: "Delete a submitted score"
 *     description: "This endpoint requires an authenticated administrator. The route is registered now and intentionally returns 404 Not Implemented until its service logic is added."
 *     operationId: deleteScoresByScoreGuid
 *     security:
 *       - BeatKhanaAuth: []
 *     x-required-roles:
 *       - admin
 *     parameters:
 *       - in: path
 *         name: scoreGuid
 *         required: true
 *         description: "Identifies the scoreGuid resource."
 *         schema:
 *           type: string
 *     responses:
 *       404:
 *         description: The endpoint is registered but its implementation is not available yet.
 *         content:
 *           text/plain:
 *             schema:
 *               type: string
 *               example: Not Implemented
 */
router.delete("/scores/:scoreGuid", (req, res) => {
	res.status(404).type("text/plain").send("Not Implemented");
});

export default router;
