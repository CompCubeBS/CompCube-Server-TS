import { acknowledged, type Ack, type PublicSocket } from "../common";
import { helloEvent, type HelloInput, type HelloOutput } from "./hello.types";

/** Registers the sample "hello" request and returns the authenticated user and server time. */
export function registerHelloPacket(socket: PublicSocket): void {
	socket.on(
		helloEvent,
		(input: HelloInput, ack: Ack<HelloOutput>) =>
			void acknowledged(ack, async () => ({
				message: input?.message
					? `Hello, ${input.message}`
					: "Hello from CompCube",
				userGuid: socket.data.user?.guid ?? null,
				serverTime: new Date().toISOString(),
			})),
	);
}
