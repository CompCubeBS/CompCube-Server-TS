import assert from "node:assert/strict";
import test from "node:test";
import { matchMmrPolicy } from "../src/services/gameplay.service";

test("mock matches calculate display MMR without persisting rankings", () => {
	assert.deepEqual(
		matchMmrPolicy({ competitive: false, isMock: true, seasonGuid: "season" }),
		{ calculate: true, persist: false },
	);
});

test("competitive and casual matches retain their ranking policies", () => {
	assert.deepEqual(
		matchMmrPolicy({ competitive: true, isMock: false, seasonGuid: "season" }),
		{ calculate: true, persist: true },
	);
	assert.deepEqual(
		matchMmrPolicy({ competitive: false, isMock: false, seasonGuid: "season" }),
		{ calculate: false, persist: false },
	);
	assert.deepEqual(
		matchMmrPolicy({ competitive: false, isMock: true, seasonGuid: null }),
		{ calculate: false, persist: false },
	);
});
