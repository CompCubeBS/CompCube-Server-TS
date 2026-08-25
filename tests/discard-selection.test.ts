import assert from "node:assert/strict";
import test from "node:test";
import { isValidDiscardSelection } from "../src/services/gameplay.service";

const originalActiveMaps = new Set(["map-a", "map-b", "map-c", "map-d", "map-e"]);

test("a player may submit zero, one or two distinct originally dealt maps", () => {
	assert.equal(isValidDiscardSelection([], originalActiveMaps), true);
	assert.equal(isValidDiscardSelection(["map-a"], originalActiveMaps), true);
	assert.equal(isValidDiscardSelection(["map-a", "map-b"], originalActiveMaps), true);
});

test("a player cannot submit more than two maps or the same map twice", () => {
	assert.equal(isValidDiscardSelection(["map-a", "map-b", "map-c"], originalActiveMaps), false);
	assert.equal(isValidDiscardSelection(["map-a", "map-a"], originalActiveMaps), false);
});

test("a player cannot discard a replacement or another player's map", () => {
	assert.equal(isValidDiscardSelection(["replacement-map"], originalActiveMaps), false);
	assert.equal(isValidDiscardSelection(["map-a", "replacement-map"], originalActiveMaps), false);
});
