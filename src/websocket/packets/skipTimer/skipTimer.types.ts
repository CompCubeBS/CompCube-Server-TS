export const skipTimerEvent = "skipTimer" as const;
export const skipTimerInput = { matchGuid: "uuid", timerGuid: "uuid" } as const;
export const skipTimerOutput = { skipped: "boolean" } as const;
export interface SkipTimerInput {
	matchGuid: string;
	timerGuid: string;
}
export interface SkipTimerOutput {
	skipped: boolean;
}
