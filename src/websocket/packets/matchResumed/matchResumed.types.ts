export const matchResumedEvent = "matchResumed" as const;
export const matchResumedOutput = {
	matchGuid: "uuid",
	status: "match_status",
	resumedAt: "date-time",
} as const;
export interface MatchResumedOutput {
	matchGuid: string;
	status: string;
	resumedAt: string;
}
