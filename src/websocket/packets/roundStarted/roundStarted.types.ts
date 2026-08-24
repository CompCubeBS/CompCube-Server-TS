export const roundStartedEvent = "roundStarted" as const;
export const roundStartedOutput = {
	matchGuid: "uuid",
	roundGuid: "uuid",
	roundNumber: "integer",
	startsAt: "date-time",
} as const;
export interface RoundStartedOutput {
	matchGuid: string;
	roundGuid: string;
	roundNumber: number;
	startsAt: string;
}
