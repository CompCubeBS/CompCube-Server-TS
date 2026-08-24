export const matchPausedEvent = "matchPaused" as const;
export const matchPausedOutput = {
	matchGuid: "uuid",
	reason: "string|null",
	pausedAt: "date-time",
} as const;
export interface MatchPausedOutput {
	matchGuid: string;
	reason: string | null;
	pausedAt: string;
}
