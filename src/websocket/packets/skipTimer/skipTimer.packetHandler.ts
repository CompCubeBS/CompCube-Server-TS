import { and, eq } from "drizzle-orm";
import { db } from "../../../../db/db";
import { matchParticipants } from "../../../../db/schema";
import { timerService } from "../../../services/timer.service";
import { ServiceError } from "../../../services/serviceError";
import { acknowledged, type Ack, type AuthenticatedSocket } from "../common";
import {
	skipTimerEvent,
	type SkipTimerInput,
	type SkipTimerOutput,
} from "./skipTimer.types";

/** Registers the "skipTimer" request for active match participants. */
export function registerSkipTimerPacket(socket: AuthenticatedSocket): void {
	socket.on(
		skipTimerEvent,
		(input: SkipTimerInput, ack: Ack<SkipTimerOutput>) =>
			void acknowledged(ack, async () => {
				const participant = await db.query.matchParticipants.findFirst({
					columns: { userGuid: true },
					where:
						and(
							eq(matchParticipants.matchGuid, input.matchGuid),
							eq(
								matchParticipants.userGuid,
								socket.data.user.guid,
							),
							eq(matchParticipants.active, true),
						),
				});

				if (!participant) {
					throw new ServiceError(
						"NOT_A_PARTICIPANT",
						"Only an active match participant can skip its timer",
						403,
					);
				}

				return {
					skipped: await timerService.skip(
						input.timerGuid,
						input.matchGuid,
					),
				};
			}),
	);
}
