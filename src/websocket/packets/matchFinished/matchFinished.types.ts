export const matchFinishedEvent = "matchFinished" as const;
export const matchFinishedOutput = {
	matchGuid: "uuid",
	result: "win|loss|draw",
	winnerUserGuid: "uuid|null",
	outcome: "match_outcome_kind",
	mmrChange: "integer",
	reason: "string|null",
} as const;
export interface MatchFinishedOutput {
	matchGuid: string;
	result: "win" | "loss" | "draw";
	winnerUserGuid: string | null;
	outcome: string;
	mmrChange: number;
	reason: string | null;
}
