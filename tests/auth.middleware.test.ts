import assert from "node:assert/strict";
import test from "node:test";
import type { Request } from "express";
import { readAccessToken } from "../src/middleware/auth.middleware";

function request(headers: Record<string, string>): Request {
	const normalized = Object.fromEntries(
		Object.entries(headers).map(([name, value]) => [name.toLowerCase(), value]),
	);
	return {
		get(name: string) {
			return normalized[name.toLowerCase()];
		},
	} as Request;
}

test("reads access tokens from the Authorization bearer header", () => {
	assert.equal(
		readAccessToken(request({ authorization: "Bearer access-token" })),
		"access-token",
	);
	assert.equal(
		readAccessToken(request({ authorization: "bearer\taccess-token" })),
		"access-token",
	);
});

test("never accepts the frontend session cookie as API authentication", () => {
	assert.equal(
		readAccessToken(request({ cookie: "cc_auth_token=cookie-token" })),
		null,
	);
	assert.equal(
		readAccessToken(request({
			authorization: "Basic Zm9vOmJhcg==",
			cookie: "cc_auth_token=cookie-token",
		})),
		null,
	);
});
