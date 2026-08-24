export const timerUpdatedEvent = "timerUpdated" as const;
export const timerUpdatedOutput = {
	matchGuid: "uuid",
	timerGuid: "uuid",
	kind: "timer_kind",
	status: "timer_status",
	dueAt: "date-time|null",
	remainingMs: "integer",
} as const;
export interface TimerUpdatedOutput {
	matchGuid: string;
	timerGuid: string;
	kind: string;
	status: string;
	dueAt: string | null;
	remainingMs: number;
}
