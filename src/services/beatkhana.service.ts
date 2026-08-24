import { createPublicKey, verify as verifySignature, type KeyObject } from "node:crypto";
import { config, assertOAuthConfigured } from "../config";
import { fetchJson } from "./httpJson.service";
import type {
	BeatKhanaTokenClaims,
	BeatKhanaTokenResponse,
	BeatKhanaUser,
} from "./beatkhana.types";

const REQUIRED_SCOPE = "compcube";
const CLOCK_TOLERANCE_SECONDS = 30;

export class BeatKhanaTokenError extends Error {
	constructor(
		message: string,
		public readonly code: "INVALID_TOKEN" | "INSUFFICIENT_SCOPE",
		public readonly status: 401 | 403,
	) {
		super(message);
	}
}

function decodeJsonPart(value: string): unknown {
	return JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
}

function isStringArray(value: unknown): value is string[] {
	return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

/** Reads scopes from BeatKhana's JWT claim without trusting the separate OAuth token response. */
function accessTokenScopes(claims: Partial<BeatKhanaTokenClaims>): string[] {
	if (isStringArray(claims.scopes)) {
		return [...new Set(claims.scopes.map((scope) => scope.trim()).filter(Boolean))];
	}
	if (typeof claims.scope === "string") {
		return [...new Set(claims.scope.split(/\s+/).map((scope) => scope.trim()).filter(Boolean))];
	}
	throw new Error("JWT scopes are missing");
}

class BeatKhanaService {
	private publicKey: KeyObject | null = null;

	/** Fetches and caches BeatKhana's signing key. The server does not start until this succeeds. */
	async initialize(): Promise<void> {
		const response = await fetchJson<{ algorithm: string; publicKey: string }>(
			"BeatKhana",
			config.beatKhana.publicKeyUrl,
		);
		if (response.algorithm !== "RS256" || !response.publicKey) {
			throw new Error("BeatKhana returned an unsupported signing key");
		}
		this.publicKey = createPublicKey(response.publicKey);
		console.info("[Auth]: BeatKhana RS256 public key loaded");
	}

	/** Fetches a public BeatKhana profile by GUID, Discord ID or linked platform ID. */
	async getUser(identifier: string): Promise<BeatKhanaUser> {
		const profile = await fetchJson<BeatKhanaUser>(
			"BeatKhana",
			`${config.beatKhana.apiUrl}/users/${encodeURIComponent(identifier)}`,
		);
		if (!profile.guid || !profile.discordId || !profile.username) {
			throw new Error("BeatKhana returned an invalid user profile");
		}
		return profile;
	}

	/** Builds the BeatKhana OAuth authorization URL for a persisted state value. */
	authorizationUrl(state: string): string {
		assertOAuthConfigured();
		const url = new URL(config.beatKhana.authorizeUrl);
		url.searchParams.set("response_type", "code");
		url.searchParams.set("client_id", config.beatKhana.clientId);
		url.searchParams.set("redirect_uri", config.beatKhana.callbackUrl);
		url.searchParams.set("scope", config.beatKhana.scope);
		url.searchParams.set("state", state);
		return url.toString();
	}

	/** Exchanges an OAuth authorization code for access and refresh tokens. */
	async exchangeCode(code: string): Promise<BeatKhanaTokenResponse> {
		assertOAuthConfigured();
		const basic = Buffer.from(`${config.beatKhana.clientId}:${config.beatKhana.clientSecret}`).toString("base64");
		return fetchJson("BeatKhana", `${config.beatKhana.apiUrl}/oauth/token`, {
			method: "POST",
			headers: { authorization: `Basic ${basic}`, "content-type": "application/x-www-form-urlencoded" },
			body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: config.beatKhana.callbackUrl }),
		});
	}

	/** Exchanges a BeatKhana refresh token for a fresh token pair. */
	async refresh(refreshToken: string): Promise<BeatKhanaTokenResponse> {
		assertOAuthConfigured();
		const basic = Buffer.from(`${config.beatKhana.clientId}:${config.beatKhana.clientSecret}`).toString("base64");
		return fetchJson("BeatKhana", `${config.beatKhana.apiUrl}/oauth/token`, {
			method: "POST",
			headers: { authorization: `Basic ${basic}`, "content-type": "application/x-www-form-urlencoded" },
			body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken }),
		});
	}

	/** Verifies signature, expiry/not-before dates, CompCube scope, and the embedded identity locally. */
	verifyAccessToken(accessToken: string): BeatKhanaTokenClaims {
		if (!this.publicKey) throw new Error("BeatKhana signing key has not been initialized");
		const parts = accessToken.split(".");
		if (parts.length !== 3) throw new BeatKhanaTokenError("Malformed BeatKhana token", "INVALID_TOKEN", 401);
		try {
			const header = decodeJsonPart(parts[0]) as { alg?: unknown; typ?: unknown };
			if (header?.alg !== "RS256") throw new Error("Unexpected JWT algorithm");
			const validSignature = verifySignature(
				"RSA-SHA256",
				Buffer.from(`${parts[0]}.${parts[1]}`),
				this.publicKey,
				Buffer.from(parts[2], "base64url"),
			);
			if (!validSignature) throw new Error("Invalid JWT signature");

			const claims = decodeJsonPart(parts[1]) as Partial<BeatKhanaTokenClaims>;
			const now = Math.floor(Date.now() / 1000);
			if (typeof claims.exp !== "number" || claims.exp <= now - CLOCK_TOLERANCE_SECONDS) throw new Error("Expired JWT");
			if (typeof claims.iat !== "number" || claims.iat > now + CLOCK_TOLERANCE_SECONDS) throw new Error("Invalid JWT issue date");
			if (typeof claims.nbf === "number" && claims.nbf > now + CLOCK_TOLERANCE_SECONDS) throw new Error("JWT is not active yet");
			const scopes = accessTokenScopes(claims);
			if (!scopes.includes(REQUIRED_SCOPE)) {
				throw new BeatKhanaTokenError("The BeatKhana token does not include the compcube scope", "INSUFFICIENT_SCOPE", 403);
			}
			const guid = typeof claims.guid === "string" ? claims.guid : null;
			const discordId = typeof claims.discordId === "string" ? claims.discordId : typeof claims.id === "string" ? claims.id : null;
			const platformId = typeof claims.platformId === "string" && /^\d+$/.test(claims.platformId) ? claims.platformId : undefined;
			if ((!guid || !discordId) && !platformId) throw new Error("JWT has no usable identity");
			return {
				guid,
				id: discordId,
				discordId,
				username: typeof claims.username === "string" && claims.username.trim() ? claims.username : "Beat Saber Player",
				avatarUrl: typeof claims.avatarUrl === "string" ? claims.avatarUrl : null,
				global_name: typeof claims.global_name === "string" ? claims.global_name : null,
				platform: typeof claims.platform === "string" ? claims.platform : undefined,
				platformId,
				platformIds: isStringArray(claims.platformIds) ? [...new Set(claims.platformIds.filter((id) => /^\d+$/.test(id)))] : platformId ? [platformId] : [],
				tokenType: claims.tokenType === "beatkhana:game" ? claims.tokenType : undefined,
				scopes,
				iat: claims.iat,
				exp: claims.exp,
				nbf: claims.nbf,
			};
		} catch (error) {
			if (error instanceof BeatKhanaTokenError) throw error;
			throw new BeatKhanaTokenError("BeatKhana token verification failed", "INVALID_TOKEN", 401);
		}
	}
}

export const beatKhanaService = new BeatKhanaService();
export const beatKhanaRequiredScope = REQUIRED_SCOPE;
