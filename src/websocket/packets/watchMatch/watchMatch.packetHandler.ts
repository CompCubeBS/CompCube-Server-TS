import { eq } from "drizzle-orm";
import { db } from "../../../../db/db";
import { matches } from "../../../../db/schema";
import { ServiceError } from "../../../services/serviceError";
import { acknowledged, type Ack, type PublicSocket } from "../common";
import { watchMatchEvent, type WatchMatchInput, type WatchMatchOutput } from "./watchMatch.types";

/** Registers a public live-match subscription after confirming that the match exists. */
export function registerWatchMatchPacket(socket: PublicSocket): void {
	socket.on(
		watchMatchEvent,
		(input: WatchMatchInput, ack: Ack<WatchMatchOutput>) =>
			void acknowledged(ack, async () => {
				if (!input?.matchGuid) throw new ServiceError("MATCH_GUID_REQUIRED", "matchGuid is required", 400);
				const match = await db.query.matches.findFirst({
					columns: { guid: true, isMock: true },
					where: eq(matches.guid, input.matchGuid),
				});
				if (!match) throw new ServiceError("MATCH_NOT_FOUND", "Match does not exist", 404);
				if (match.isMock && !socket.data.user?.permissions.some((permission) => ["role:admin", "role:dev"].includes(permission))) {
					throw new ServiceError("MATCH_NOT_FOUND", "Match does not exist", 404);
				}
				await socket.join(`match:${match.guid}`);
				return { watching: true };
			}),
	);
}
