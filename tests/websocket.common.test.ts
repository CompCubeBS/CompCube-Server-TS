import assert from "node:assert/strict";
import test from "node:test";
import { ServiceError } from "../src/services/serviceError";
import { acknowledged, type Ack } from "../src/websocket/packets/common";

test("packet acknowledgements return service errors to the client", async () => {
	let response: Parameters<Ack<never>>[0] | undefined;
	const ack: Ack<never> = (value) => {
		response = value;
	};

	await acknowledged(ack, async () => {
		throw new ServiceError(
			"QUEUE_UNAVAILABLE",
			"Queue is closed or does not exist",
			404,
		);
	});

	assert.deepEqual(response, {
		ok: false,
		error: {
			code: "QUEUE_UNAVAILABLE",
			message: "Queue is closed or does not exist",
		},
	});
});

test("packet acknowledgements hide unexpected internal errors", async () => {
	let response: Parameters<Ack<never>>[0] | undefined;
	const ack: Ack<never> = (value) => {
		response = value;
	};

	await acknowledged(ack, async () => {
		throw new Error("database credentials must not reach the client");
	});

	assert.deepEqual(response, {
		ok: false,
		error: {
			code: "INTERNAL_ERROR",
			message: "The request could not be completed",
		},
	});
});
