import { matchService } from "../../../services/match.service";
import { ServiceError } from "../../../services/serviceError";
import { acknowledged, type Ack, type AuthenticatedSocket } from "../common";
import {
	resumeMatchEvent,
	type ResumeMatchInput,
	type ResumeMatchOutput,
} from "./resumeMatch.types";

/** Registers the moderator-only "resumeMatch" request. */
export function registerResumeMatchPacket(socket: AuthenticatedSocket): void {
	socket.on(
		resumeMatchEvent,
		(input: ResumeMatchInput, ack: Ack<ResumeMatchOutput>) =>
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

				const match = await matchService.resume(
					input.matchGuid,
					socket.data.user.guid,
				);
				return { status: match.status, version: match.version };
			}),
	);
}
