import { createHash, randomBytes } from "node:crypto";
import { Router } from "express";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db } from "../../db/db";
import { oauthStates } from "../../db/schema";
import { config } from "../config";
import { accountService } from "../services/account.service";
import { beatKhanaService } from "../services/beatkhana.service";

const router = Router();
const hash = (value: string) =>
	createHash("sha256").update(value).digest("hex");

/**
 * @openapi
 * /oauth/login:
 *   get:
 *     tags: [Authentication]
 *     summary: Start BeatKhana OAuth
 *     description: Creates a one-time, database-backed state and redirects to BeatKhana. Use mode=json for plugin/native callbacks.
 *     parameters:
 *       - in: query
 *         name: returnTo
 *         schema: { type: string, example: /account }
 *       - in: query
 *         name: mode
 *         schema: { type: string, enum: [redirect, json] }
 *     responses:
 *       302:
 *         description: Redirects to the requested resource.
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
router.get("/login", async (req, res) => {
	try {
		const state = randomBytes(32).toString("base64url");
		const returnTo =
			typeof req.query.returnTo === "string" &&
			req.query.returnTo.startsWith("/") &&
			!req.query.returnTo.startsWith("//")
				? req.query.returnTo
				: "/";
		const responseMode = req.query.mode === "json" ? "json" : "redirect";
		await db.insert(oauthStates).values({
			stateHash: hash(state),
			returnTo,
			responseMode,
			expiresAt: new Date(Date.now() + 10 * 60_000),
		});
		res.redirect(beatKhanaService.authorizationUrl(state));
	} catch (error) {
		console.error("[OAuth]: Failed to start BeatKhana login", error);
		res.status(503).json({
			error: {
				code: "OAUTH_NOT_CONFIGURED",
				message: "BeatKhana login is currently unavailable",
			},
		});
	}
});

/**
 * @openapi
 * /oauth/callback:
 *   get:
 *     tags: [Authentication]
 *     summary: Complete BeatKhana OAuth and create or merge the CompCube account
 *     parameters:
 *       - in: query
 *         name: code
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: state
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       302:
 *         description: Redirects to the requested resource.
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
router.get("/callback", async (req, res) => {
	const code = typeof req.query.code === "string" ? req.query.code : "";
	const state = typeof req.query.state === "string" ? req.query.state : "";
	if (!code || !state) {
		res.status(400).json({
			error: {
				code: "INVALID_CALLBACK",
				message: "code and state are required",
			},
		});
		return;
	}
	const [saved] = await db
		.update(oauthStates)
		.set({ consumedAt: new Date() })
		.where(
			and(
				eq(oauthStates.stateHash, hash(state)),
				gt(oauthStates.expiresAt, new Date()),
				isNull(oauthStates.consumedAt),
			),
		)
		.returning();
	if (!saved) {
		res.status(400).json({
			error: {
				code: "INVALID_STATE",
				message: "OAuth state is invalid, expired, or already used",
			},
		});
		return;
	}
	try {
		const token = await beatKhanaService.exchangeCode(code);
		const claims = beatKhanaService.verifyAccessToken(token.access_token);
		const account = await accountService.upsertFromBeatKhanaToken(
			claims,
			config.beatKhana.linkingUrl,
		);
		if (saved.responseMode === "json") {
			res.json({ token, ...account });
			return;
		}
		const secure = config.beatKhana.callbackUrl.startsWith("https://");
		res.cookie("cc_auth_token", token.access_token, {
			httpOnly: true,
			secure,
			sameSite: "lax",
			maxAge: token.expires_in * 1000,
			path: "/",
			domain: config.authCookieDomain,
		});
		res.cookie("cc_refresh_token", token.refresh_token, {
			httpOnly: true,
			secure,
			sameSite: "lax",
			maxAge: 365 * 24 * 60 * 60_000,
			path: "/",
			domain: config.authCookieDomain,
		});
		const redirect = new URL(saved.returnTo, config.websiteUrl);
		if (!account.canQueue) {
			redirect.searchParams.set("linkRequired", "true");
		}
		res.redirect(redirect.toString());
	} catch (error) {
		console.error("[OAuth]: BeatKhana callback failed", error);
		if (saved.responseMode === "redirect") {
			const redirect = new URL("/auth/error", config.websiteUrl);
			redirect.searchParams.set("reason", "beatkhana_unavailable");
			res.redirect(redirect.toString());
			return;
		}
		res.status(502).json({
			error: {
				code: "BEATKHANA_OAUTH_FAILED",
				message: "BeatKhana login could not be completed",
			},
		});
	}
});

/**
 * @openapi
 * /oauth/refresh:
 *   post:
 *     tags: [Authentication]
 *     summary: Refresh a BeatKhana OAuth token
 *     description: Uses the HttpOnly refresh cookie by default, or a refreshToken JSON field for native clients.
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
router.post("/refresh", async (req, res) => {
	const cookies = Object.fromEntries(
		(req.get("cookie") ?? "")
			.split(";")
			.map((item) => item.trim().split(/=(.*)/, 2))
			.filter(([key]) => key),
	);
	const refreshToken =
		typeof req.body?.refreshToken === "string"
			? req.body.refreshToken
			: cookies.cc_refresh_token
				? decodeURIComponent(cookies.cc_refresh_token)
				: "";
	if (!refreshToken) {
		res.status(401).json({
			error: {
				code: "REFRESH_TOKEN_REQUIRED",
				message: "No refresh token was provided",
			},
		});
		return;
	}
	try {
		res.json(await beatKhanaService.refresh(refreshToken));
	} catch {
		res.status(401).json({
			error: {
				code: "REFRESH_FAILED",
				message: "BeatKhana rejected the refresh token",
			},
		});
	}
});

/**
 * @openapi
 * /oauth/logout:
 *   post:
 *     tags: [Authentication]
 *     summary: Clear CompCube OAuth cookies
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
router.post("/logout", (req, res) => {
	res.clearCookie("cc_auth_token", { path: "/", domain: config.authCookieDomain });
	res.clearCookie("cc_refresh_token", { path: "/", domain: config.authCookieDomain });
	res.status(204).send();
});

export default router;
