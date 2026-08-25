export const roundResultsEvent = "roundResults" as const;
export const roundResultsOutput = {
	matchGuid: "uuid",
	roundGuid: "uuid",
	winnerUserGuid: "uuid|null",
	redHealth: "number",
	blueHealth: "number",
	scores: "score[]",
	resultsDueAt: "date-time|null",
} as const;
export interface RoundResultScore {
	guid: string;
	roundGuid: string;
	userGuid: string;
	modifiedScore: number;
	maxScore: number;
	accuracy: number;
	proMode: boolean;
	missCount: number;
	fullCombo: boolean;
	modifiers: string[];
	timedOut: boolean;
	healthBefore: number;
	damageTaken: number;
	healthAfter: number;
	submittedAt: Date | null;
	createdAt: Date;
}
export interface RoundResultsOutput {
	matchGuid: string;
	roundGuid: string;
	winnerUserGuid: string | null;
	redHealth: number;
	blueHealth: number;
	scores: RoundResultScore[];
	resultsDueAt: string | null;
}
