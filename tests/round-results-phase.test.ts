import assert from "node:assert/strict";
import test from "node:test";
import { phaseDeadline } from "../src/services/gameplay.service";

test("round results finish before a fresh full pick deadline starts", () => {
	const resolvedAt = new Date("2026-08-25T20:00:00.000Z");
	const resultsDueAt = phaseDeadline(resolvedAt, 6);
	const pickDueAt = phaseDeadline(resultsDueAt, 45);

	assert.equal(resultsDueAt.toISOString(), "2026-08-25T20:00:06.000Z");
	assert.equal(pickDueAt.toISOString(), "2026-08-25T20:00:51.000Z");
	assert.equal(pickDueAt.getTime() - resultsDueAt.getTime(), 45_000);
});

test("phase deadlines reject invalid durations", () => {
	assert.throws(() => phaseDeadline(new Date(), -1));
	assert.throws(() => phaseDeadline(new Date(), Number.NaN));
});
