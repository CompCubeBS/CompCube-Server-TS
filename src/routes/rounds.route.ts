import { Router } from "express";
import { and, eq } from "drizzle-orm";
import { db } from "../../db/db";
import { matchRounds, matches } from "../../db/schema";
import { requireAuth } from "../middleware/auth.middleware";

const router = Router();

/**
 * @openapi
 * /matches/{matchGuid}/rounds:
 *   get:
 *     tags: [Rounds]
 *     summary: "List persisted match rounds"
 *     description: "Public round history including maps, winners and submitted scores."
 *     operationId: getMatchesByMatchGuidRounds
 *     parameters:
 *       - in: path
 *         name: matchGuid
 *         required: true
 *         description: "Identifies the matchGuid resource."
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
router.get("/matches/:matchGuid/rounds", async (req, res) => {
	res.json(await db.query.matchRounds.findMany({
		where: eq(matchRounds.matchGuid, String(req.params.matchGuid)),
		orderBy: matchRounds.roundNumber,
		with: { map: true, picker: true, winner: true, scores: true },
	}));
});

/**
 * @openapi
 * /matches/{matchGuid}/rounds:
 *   post:
 *     tags: [Rounds]
 *     summary: "Start a round with the selected map"
 *     description: "This endpoint requires an authenticated BeatKhana account."
 *     operationId: postMatchesByMatchGuidRounds
 *     security:
 *       - BeatKhanaAuth: []
 *     parameters:
 *       - in: path
 *         name: matchGuid
 *         required: true
 *         description: "Identifies the matchGuid resource."
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
router.post("/matches/:matchGuid/rounds", (_req, res) => {
	res.status(405).json({
		error: {
			code: "SOCKET_ONLY",
			message: "Select maps and begin rounds through the selectMap socket packet",
		},
	});
});

/**
 * @openapi
 * /matches/{matchGuid}/rounds/{roundGuid}:
 *   get:
 *     tags: [Rounds]
 *     summary: "Get a persisted match round"
 *     description: "Public details for one persisted match round."
 *     operationId: getMatchesByMatchGuidRoundsByRoundGuid
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
router.get("/matches/:matchGuid/rounds/:roundGuid", async (req, res) => {
	const round = await db.query.matchRounds.findFirst({
		where: and(
			eq(matchRounds.matchGuid, String(req.params.matchGuid)),
			eq(matchRounds.guid, String(req.params.roundGuid)),
		),
		with: { match: true, map: true, picker: true, winner: true, scores: true },
	});
	if (!round) {
		res.status(404).json({ error: { code: "ROUND_NOT_FOUND", message: "Match round does not exist" } });
		return;
	}
	res.json(round);
});

export default router;
