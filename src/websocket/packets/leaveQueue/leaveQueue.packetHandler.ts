import { queueService } from "../../../services/queue.service";
import { acknowledged, type Ack, type AuthenticatedSocket } from "../common";
import { leaveQueueEvent, type LeaveQueueOutput } from "./leaveQueue.types";

/** Registers the "leaveQueue" request and reports whether a queue entry was removed. */
export function registerLeaveQueuePacket(socket: AuthenticatedSocket): void {
	socket.on(
		leaveQueueEvent,
		(_input: unknown, ack: Ack<LeaveQueueOutput>) =>
			void acknowledged(ack, async () => ({
				removed: await queueService.leave(socket.data.user.guid),
			})),
	);
}
