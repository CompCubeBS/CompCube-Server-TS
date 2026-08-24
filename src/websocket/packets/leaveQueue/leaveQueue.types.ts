export const leaveQueueEvent = "leaveQueue" as const;
export const leaveQueueInput = {} as const;
export const leaveQueueOutput = { removed: "boolean" } as const;
export type LeaveQueueInput = Record<string, never>;
export interface LeaveQueueOutput {
	removed: boolean;
}
