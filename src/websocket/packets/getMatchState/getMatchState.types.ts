export const getMatchStateEvent = "getMatchState" as const;
export const getMatchStateInput = { matchGuid: "uuid" } as const;
export const getMatchStateOutput = {
	match: "Match",
	participants: "MatchParticipant[]",
	timers: "MatchTimer[]",
} as const;

export interface GetMatchStateInput {
	matchGuid: string;
}

export interface GetMatchStateOutput {
	match: unknown;
	participants: unknown[];
	timers: unknown[];
}
