import { Router } from "express";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../../db/db";
import { competitiveStatistics, seasons, users } from "../../db/schema";

const router = Router();

/**
 * @openapi
 * /leaderboard/range:
 *   get:
 *     tags: [Leaderboards]
 *     summary: "Get a range of leaderboard entries"
 *     description: "This endpoint is public."
 *     operationId: getLeaderboardRange
 *     parameters:
 *       - in: query
 *         name: start
 *         required: false
 *         description: "Optional start query value."
 *         schema:
 *           type: string
 *       - in: query
 *         name: range
 *         required: false
 *         description: "Optional range query value."
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
router.get("/leaderboard/range", async (req, res) => {
	const start = Math.max(0, Number.parseInt(String(req.query.start ?? "0"), 10) || 0);
	const range = Math.min(100, Math.max(1, Number.parseInt(String(req.query.range ?? "50"), 10) || 50));
	const season = await db.query.seasons.findFirst({
		columns: { guid: true },
		where: eq(seasons.isCurrent, true),
	});
	if (!season) {
		res.json([]);
		return;
	}
	const rows = await db.query.competitiveStatistics.findMany({
		where: eq(competitiveStatistics.seasonGuid, season.guid),
		orderBy: desc(competitiveStatistics.currentMmr),
		offset: start,
		limit: range,
		with: { user: true },
	});
	res.json(rows.map((row, index) => ({
		rank: start + index + 1,
		userGuid: row.user.guid,
		platformId: row.user.platformId,
		username: row.user.username,
		avatarUrl: row.user.avatarUrl,
		mmr: row.currentMmr,
		wins: row.wins,
		totalGames: row.totalGames,
		winStreak: row.winStreak,
		bestWinStreak: row.bestWinStreak,
	})));
});

/**
 * @openapi
 * /leaderboard/aroundUser/{userId}:
 *   get:
 *     tags: [Leaderboards]
 *     summary: "Get leaderboard entries around a user"
 *     description: "This endpoint is public."
 *     operationId: getLeaderboardAroundUserByUserId
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         description: "Identifies the userId resource."
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
router.get("/leaderboard/aroundUser/:userId", async (req, res) => {
	const season = await db.query.seasons.findFirst({
		columns: { guid: true },
		where: eq(seasons.isCurrent, true),
	});
	const rows = season
		? await db.query.competitiveStatistics.findMany({
			where: eq(competitiveStatistics.seasonGuid, season.guid),
			orderBy: desc(competitiveStatistics.currentMmr),
			with: { user: true },
		})
		: [];
	const index = rows.findIndex((row) =>
		row.user.guid === req.params.userId || row.user.platformId === req.params.userId
	);
	if (index < 0) {
		res.status(404).json({ error: { code: "USER_NOT_RANKED", message: "User is not on the current leaderboard" } });
		return;
	}
	const start = Math.max(0, index - 5);
	res.json(rows.slice(start, index + 6).map((row, offset) => ({
		rank: start + offset + 1,
		userGuid: row.user.guid,
		platformId: row.user.platformId,
		username: row.user.username,
		avatarUrl: row.user.avatarUrl,
		mmr: row.currentMmr,
		wins: row.wins,
		totalGames: row.totalGames,
	})));
});

/**
 * @openapi
 * /seasons/{seasonGuid}/leaderboard:
 *   get:
 *     tags: [Leaderboards]
 *     summary: "Get a season leaderboard"
 *     description: "This endpoint is public."
 *     operationId: getSeasonsBySeasonGuidLeaderboard
 *     parameters:
 *       - in: path
 *         name: seasonGuid
 *         required: true
 *         description: "Identifies the seasonGuid resource."
 *         schema:
 *           type: string
 *       - in: query
 *         name: start
 *         required: false
 *         description: "Optional start query value."
 *         schema:
 *           type: string
 *       - in: query
 *         name: limit
 *         required: false
 *         description: "Optional limit query value."
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
router.get("/seasons/:seasonGuid/leaderboard", async (req, res) => {
	const start = Math.max(0, Number.parseInt(String(req.query.start ?? "0"), 10) || 0);
	const limit = Math.min(100, Math.max(1, Number.parseInt(String(req.query.limit ?? "50"), 10) || 50));
	const rows = await db.query.competitiveStatistics.findMany({
		where: eq(competitiveStatistics.seasonGuid, String(req.params.seasonGuid)),
		orderBy: desc(competitiveStatistics.currentMmr),
		offset: start,
		limit,
		with: { user: true },
	});
	res.json(rows.map((row, index) => ({
		rank: start + index + 1,
		userGuid: row.user.guid,
		username: row.user.username,
		avatarUrl: row.user.avatarUrl,
		mmr: row.currentMmr,
		wins: row.wins,
		totalGames: row.totalGames,
		winStreak: row.winStreak,
	})));
});

export default router;
