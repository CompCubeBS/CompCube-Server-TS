export const pauseMatchEvent = "pauseMatch" as const;
export const pauseMatchInput = { matchGuid: "uuid" } as const;
export const pauseMatchOutput = {
	status: "paused",
	version: "integer",
} as const;
export interface PauseMatchInput {
	matchGuid: string;
}
export interface PauseMatchOutput {
	status: "paused";
	version: number;
}
