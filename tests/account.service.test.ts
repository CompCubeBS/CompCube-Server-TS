import assert from "node:assert/strict";
import test from "node:test";
import {
	beatKhanaPlatformId,
	mergeLocalAuthorization,
} from "../src/services/account.service";

test("BeatKhana preserves an id that was already confirmed by the plugin", () => {
	const ids = ["steam-id", "oculus-pc-id", "standalone-id"];
	assert.equal(beatKhanaPlatformId("oculus-pc-id", ids), "oculus-pc-id");
});

test("BeatKhana uses its priority order when the existing id no longer matches", () => {
	const ids = ["steam-id", "oculus-pc-id", "standalone-id"];
	assert.equal(beatKhanaPlatformId("old-platform-id", ids), "steam-id");
});

test("BeatKhana does not remove a plugin id when it has no linked ids", () => {
	assert.equal(beatKhanaPlatformId("plugin-id", []), "plugin-id");
});

test("new BeatKhana accounts use the first available platform id", () => {
	assert.equal(beatKhanaPlatformId(null, ["steam-id", "oculus-pc-id"]), "steam-id");
});

test("BeatKhana reconciliation preserves local roles, perks and bans", () => {
	assert.deepEqual(
		mergeLocalAuthorization([
			{ permissions: ["role:player", "role:admin"], banned: false },
			{ permissions: ["role:player", "perk:contributor"], banned: true },
		]),
		{
			permissions: ["role:player", "role:admin", "perk:contributor"],
			banned: true,
		},
	);
});
