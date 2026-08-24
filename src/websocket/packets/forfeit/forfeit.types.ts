export const forfeitEvent = "forfeit" as const;
export const forfeitInput = { matchGuid: "uuid", reason: "string?" } as const;
export const forfeitOutput = {
	winnerUserGuid: "uuid",
	loserUserGuid: "uuid",
	winnerMmrGain: "integer>=0",
	loserMmrLoss: "integer>=0",
	timeoutMinutes: "integer>=0",
} as const;

export interface ForfeitInput {
	matchGuid: string;
	reason?: string;
}

export interface ForfeitOutput {
	winnerUserGuid: string;
	loserUserGuid: string;
	winnerMmrGain: number;
	loserMmrLoss: number;
	timeoutMinutes: number;
}
