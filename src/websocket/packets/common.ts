import type { Socket } from "socket.io";
import type { User } from "../../../db/schema";
import { ServiceError } from "../../services/serviceError";

export interface SocketData {
	user?: User;
	clientType?: "plugin" | "website" | "mock";
	pluginVersion?: string;
	roundResultsSeconds?: number;
}

// Each packet handler owns its exact input/output type. Socket.IO itself stays open here so adding a packet
// does not require editing one giant event map as well as its own packet folder.
export type PublicSocket = Socket<any, any, any, SocketData>;
export type AuthenticatedSocket = PublicSocket & { data: { user: User } };
export type Ack<T> = (
	response:
		| { ok: true; data: T }
		| { ok: false; error: { code: string; message: string } },
) => void;
export interface PacketMap {
	guid: string;
	hash: string;
	characteristic: string;
	difficulty: string;
	modifiers: string[];
	durationSeconds: number;
	maxScore: number;
}

export interface PacketUser {
	guid: string;
	platformId: string;
	username: string;
	avatarUrl: string | null;
}

/** Runs a packet action and always answers its acknowledgement with either data or a safe error. */
export async function acknowledged<T>(ack: Ack<T>, action: () => Promise<T>): Promise<void> {
	try {
		const data = await action();
		ack({ ok: true, data });
	} catch (error) {
		const serviceError = error instanceof ServiceError
			? error
			: new ServiceError("INTERNAL_ERROR", "The request could not be completed", 500);
		if (!(error instanceof ServiceError)) {
			console.error("[WebSocket]: Unexpected packet handler error", error);
		}

		ack({
			ok: false,
			error: {
				code: serviceError.code,
				message: serviceError.message,
			},
		});
	}
}

/** Returns a consistent acknowledgement error for packet skeletons that are registered but not implemented. */
export function notImplemented(): never {
	throw new ServiceError(
		"NOT_IMPLEMENTED",
		"Packet is registered but its match-engine handler is not implemented",
		501,
	);
}
