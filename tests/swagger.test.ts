import assert from "node:assert/strict";
import test from "node:test";
import { swaggerSpec } from "../src/swagger";

const spec = swaggerSpec as Record<string, any>;

test("documents bearer headers as the only protected REST authentication", () => {
	const schemes = spec.components.securitySchemes;
	assert.equal(schemes.SessionCookie, undefined);
	assert.equal(schemes.BeatKhanaAuth.type, "http");
	assert.equal(schemes.BeatKhanaAuth.scheme, "bearer");
	assert.deepEqual(spec.paths["/report"].post.security, [
		{ BeatKhanaAuth: [] },
	]);
});

test("documents refresh tokens as bearer credentials", () => {
	assert.equal(
		spec.components.securitySchemes.BeatKhanaRefreshToken.scheme,
		"bearer",
	);
	assert.deepEqual(spec.paths["/oauth/refresh"].post.security, [
		{ BeatKhanaRefreshToken: [] },
	]);
});
