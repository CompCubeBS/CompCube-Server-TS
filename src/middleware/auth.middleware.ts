import type { NextFunction, Request, Response } from "express";
import { config } from "../config";
import { accountService } from "../services/account.service";
import { BeatKhanaTokenError, beatKhanaService } from "../services/beatkhana.service";
import type { User } from "../../db/schema";

declare global {
	namespace Express {
		interface Request {
			user?: User;
		}
	}
}

/** Reads a BeatKhana access token from the bearer header or the secure login cookie. */
export function readAccessToken(req: Request): string | null {
	const bearer = req.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
	if (bearer) return bearer;
	const cookies = Object.fromEntries(
		(req.get("cookie") ?? "")
			.split(";")
			.map((item) => item.trim().split(/=(.*)/, 2))
			.filter(([key]) => key),
	);
	return cookies.cc_auth_token
		? decodeURIComponent(cookies.cc_auth_token)
		: null;
}

/** Validates BeatKhana identity, reconciles the local account and attaches it to the request. */
export async function requireAuth(
	req: Request,
	res: Response,
	next: NextFunction,
): Promise<void> {
	const token = readAccessToken(req);
	if (!token) {
		res.status(401).json({
			error: {
				code: "AUTH_REQUIRED",
				message: "Provide a BeatKhana bearer token",
			},
		});
		return;
	}
	try {
		const claims = beatKhanaService.verifyAccessToken(token);
		req.user = (
			await accountService.upsertFromBeatKhanaToken(
				claims,
				config.beatKhana.linkingUrl,
			)
		).user;
		next();
	} catch (error) {
		const authError = error instanceof BeatKhanaTokenError ? error : null;
		res.status(authError?.status ?? 401).json({
			error: {
				code: authError?.code ?? "INVALID_TOKEN",
				message: authError?.message ?? "BeatKhana authentication failed",
			},
		});
	}
}

/** Attaches a valid local account when available while keeping public reads public. */
export async function optionalAuth(
	req: Request,
	_res: Response,
	next: NextFunction,
): Promise<void> {
	const token = readAccessToken(req);
	if (!token) {
		next();
		return;
	}
	try {
		const claims = beatKhanaService.verifyAccessToken(token);
		req.user = (
			await accountService.upsertFromBeatKhanaToken(claims, config.beatKhana.linkingUrl)
		).user;
	} catch {
		// An expired browser cookie must not break otherwise public views.
	}
	next();
}
