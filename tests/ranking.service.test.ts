import assert from "node:assert/strict";
import test from "node:test";
import {
	calculateAccuracy,
	calculateModifiedScore,
	calculateMmrChange,
	calculateRoundHealth,
	damageMultiplier,
	resolveMatchHealthOutcome,
	scoreSubmissionDeadline,
	speedModifierMultiplier,
	gameplayModifierScoreMultiplier,
} from "../src/services/ranking.service";
import { disconnectPenaltyMinutes } from "../src/services/gameplay.service";

test("accuracy is stored as the exact raw score ratio", () => {
	assert.equal(calculateAccuracy(97324523, 100000000), 0.97324523);
});

test("the server applies Beat Saber gameplay modifier score values", () => {
	assert.equal(gameplayModifierScoreMultiplier(["GN", "DA", "FS"]), 1.26);
	assert.equal(gameplayModifierScoreMultiplier(["SS", "NW"]), 0.65);
	assert.equal(gameplayModifierScoreMultiplier(["NF"]), 1);
	assert.equal(gameplayModifierScoreMultiplier(["NF"], true), 0.5);
	assert.equal(calculateModifiedScore(123456, ["GN"]), Math.floor(123456 * 1.11));
});

test("red and blue take damage using accuracy, not raw score", () => {
	assert.deepEqual(calculateRoundHealth(0.9, 0.8, 1, 1, 1), {
		redHealth: 1,
		blueHealth: 0.9,
		redDamage: 0,
		blueDamage: 0.09999999999999998,
		winner: "red",
	});
	assert.deepEqual(calculateRoundHealth(0.7, 0.9, 1, 0.5, 2), {
		redHealth: 0.7999999999999999,
		blueHealth: 0.5,
		redDamage: 0.20000000000000007,
		blueDamage: 0,
		winner: "blue",
	});
});

test("ties do no damage", () =>
	assert.equal(calculateRoundHealth(0.9, 0.9, 1, 1, 5).winner, null));
test("round multiplier matches the existing server", () => {
	assert.equal(damageMultiplier(1), 1);
	assert.equal(damageMultiplier(2), 1);
	assert.equal(damageMultiplier(3), 4.5);
});
test("MMR change matches the existing K-factor formula", () => {
	assert.equal(calculateMmrChange(1000, 1000), 50);
	assert.ok(calculateMmrChange(800, 1200) > 50);
});

test("disconnect penalties start at fifteen minutes and double for each recent strike", () => {
	assert.deepEqual(
		Array.from({ length: 8 }, (_, previousDisconnects) => disconnectPenaltyMinutes(previousDisconnects)),
		[15, 30, 60, 120, 240, 480, 960, 1920],
	);
});

test("map exhaustion resolves by health and permits an exact draw", () => {
	assert.equal(resolveMatchHealthOutcome(0.4, 0.2, 1), null);
	assert.equal(resolveMatchHealthOutcome(0.4, 0.2, 0), "red");
	assert.equal(resolveMatchHealthOutcome(0.2, 0.4, 0), "blue");
	assert.equal(resolveMatchHealthOutcome(0.4, 0.4, 0), "draw");
	assert.equal(resolveMatchHealthOutcome(0, 0.4, 8), "blue");
});

test("score deadlines account for the map's actual playback duration", () => {
	const startedAt = new Date("2026-01-01T00:00:00.000Z");

	assert.equal(speedModifierMultiplier([]), 1);
	assert.equal(speedModifierMultiplier(["SS"]), 0.8);
	assert.equal(speedModifierMultiplier(["FS"]), 1.2);
	assert.equal(speedModifierMultiplier(["SFS"]), 1.5);
	assert.equal(
		scoreSubmissionDeadline(startedAt, 120, []).toISOString(),
		"2026-01-01T00:03:30.000Z",
	);
	assert.equal(
		scoreSubmissionDeadline(startedAt, 120, ["SS"]).toISOString(),
		"2026-01-01T00:04:15.000Z",
	);
});
