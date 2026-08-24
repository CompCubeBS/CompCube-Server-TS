import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import test from "node:test";
import { config } from "../src/config";
import { BeatKhanaTokenError, beatKhanaService } from "../src/services/beatkhana.service";

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });

function jwt(payload: Record<string, unknown>): string {
	const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
	const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
	const signature = sign("RSA-SHA256", Buffer.from(`${header}.${body}`), privateKey).toString("base64url");
	return `${header}.${body}.${signature}`;
}

test.before(async () => {
	const originalFetch = globalThis.fetch;
	globalThis.fetch = async () => new Response(JSON.stringify({
		algorithm: "RS256",
		publicKey: publicKey.export({ type: "spki", format: "pem" }).toString(),
	}), { status: 200, headers: { "content-type": "application/json" } });
	try {
		await beatKhanaService.initialize();
	} finally {
		globalThis.fetch = originalFetch;
	}
});

test("accepts a signed, current platform-only CompCube game token", () => {
	const now = Math.floor(Date.now() / 1000);
	const claims = beatKhanaService.verifyAccessToken(jwt({
		guid: null,
		id: null,
		discordId: null,
		username: "Player",
		platformId: "76561198000000000",
		tokenType: "beatkhana:game",
		scopes: ["compcube"],
		iat: now,
		exp: now + 60,
	}));
	assert.equal(claims.guid, null);
	assert.equal(claims.discordId, null);
	assert.equal(claims.platformId, "76561198000000000");
});

test("always requests the dedicated CompCube OAuth scope", () => {
	assert.equal(config.beatKhana.scope, "compcube");
});

test("accepts the OAuth-standard signed scope claim", () => {
	const now = Math.floor(Date.now() / 1000);
	const claims = beatKhanaService.verifyAccessToken(jwt({
		guid: "ec9ce058-c516-4f65-857f-eecf4f3512f8",
		id: "123456789012345678",
		username: "Player",
		scope: "rest:user:read compcube",
		iat: now,
		exp: now + 60,
	}));
	assert.deepEqual(claims.scopes, ["rest:user:read", "compcube"]);
});

test("rejects a validly signed token without the CompCube scope", () => {
	const now = Math.floor(Date.now() / 1000);
	assert.throws(
		() => beatKhanaService.verifyAccessToken(jwt({
			guid: "ec9ce058-c516-4f65-857f-eecf4f3512f8",
			id: "123456789012345678",
			username: "Player",
			scopes: ["rest:user:read"],
			iat: now,
			exp: now + 60,
		})),
		(error) => error instanceof BeatKhanaTokenError && error.code === "INSUFFICIENT_SCOPE" && error.status === 403,
	);
});

test("rejects an expired token", () => {
	const now = Math.floor(Date.now() / 1000);
	assert.throws(
		() => beatKhanaService.verifyAccessToken(jwt({
			guid: null,
			id: null,
			username: "Player",
			platformId: "76561198000000000",
			scopes: ["compcube"],
			iat: now - 120,
			exp: now - 60,
		})),
		(error) => error instanceof BeatKhanaTokenError && error.code === "INVALID_TOKEN",
	);
});
