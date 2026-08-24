import { matchService } from "../../../services/match.service";
import { ServiceError } from "../../../services/serviceError";
import { acknowledged, type Ack, type AuthenticatedSocket } from "../common";
import {
	pauseMatchEvent,
	type PauseMatchInput,
	type PauseMatchOutput,
} from "./pauseMatch.types";

/** Registers the moderator-only "pauseMatch" request. */
export function registerPauseMatchPacket(socket: AuthenticatedSocket): void {
	socket.on(
		pauseMatchEvent,
		(input: PauseMatchInput, ack: Ack<PauseMatchOutput>) =>
			void acknowledged(ack, async () => {
				const isModerator = socket.data.user.permissions.some(
					(permission) =>
						["role:admin", "role:moderator", "role:dev"].includes(
							permission,
						),
				);
				if (!isModerator) {
					throw new ServiceError(
						"FORBIDDEN",
						"A moderator is required",
						403,
					);
				}

				const match = await matchService.pause(
					input.matchGuid,
					socket.data.user.guid,
				);
				return { status: "paused" as const, version: match.version };
			}),
	);
}
