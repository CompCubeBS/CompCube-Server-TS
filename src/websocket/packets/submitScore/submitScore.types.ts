export const submitScoreEvent = "submitScore" as const;
// This is every score value the current plugin sends to the server.
export const submitScoreInput = {
	matchGuid: "uuid",
	roundGuid: "uuid",
	rawScore: "integer>=0",
	modifiedScore: "integer>=0",
	noFailTriggered: "boolean",
	proMode: "boolean",
	missCount: "integer>=0",
	fullCombo: "boolean",
} as const;
export const submitScoreOutput = {
	accepted: "boolean",
	accuracy: "number[0..1]",
	resolved: "boolean",
} as const;

export interface SubmitScoreInput {
	matchGuid: string;
	roundGuid: string;
	rawScore: number;
	modifiedScore: number;
	noFailTriggered: boolean;
	proMode: boolean;
	missCount: number;
	fullCombo: boolean;
}

export interface SubmitScoreOutput {
	accepted: boolean;
	accuracy: number;
	resolved: boolean;
}
