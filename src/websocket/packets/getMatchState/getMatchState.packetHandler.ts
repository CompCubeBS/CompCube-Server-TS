import { eq } from "drizzle-orm";
import { db } from "../../../../db/db";
import { matches } from "../../../../db/schema";
import { ServiceError } from "../../../services/serviceError";
import { acknowledged, type Ack, type PublicSocket } from "../common";
import {
	getMatchStateEvent,
	type GetMatchStateInput,
	type GetMatchStateOutput,
} from "./getMatchState.types";

/** Registers the public persisted match-state request used by live spectators. */
export function registerGetMatchStatePacket(socket: PublicSocket): void {
	socket.on(
		getMatchStateEvent,
		(input: GetMatchStateInput, ack: Ack<GetMatchStateOutput>) =>
			void acknowledged(ack, async () => {
				const match = await db.query.matches.findFirst({
					where: eq(matches.guid, input.matchGuid),
					with: {
						participants: true,
						timers: true,
						hands: { with: { maps: { with: { map: true } } } },
						rounds: { with: { map: true, scores: true } },
					},
				});
				if (!match) {
					throw new ServiceError(
						"MATCH_NOT_FOUND",
						"Match does not exist",
						404,
					);
				}
				if (match.isMock && !socket.data.user?.permissions.some((permission) => ["role:admin", "role:dev"].includes(permission))) {
					throw new ServiceError("MATCH_NOT_FOUND", "Match does not exist", 404);
				}

				return {
					match,
					participants: match.participants,
					timers: match.timers,
				};
			}),
	);
}
