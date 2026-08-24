export const resumeMatchEvent = "resumeMatch" as const;
export const resumeMatchInput = { matchGuid: "uuid" } as const;
export const resumeMatchOutput = {
	status: "match_status",
	version: "integer",
} as const;
export interface ResumeMatchInput {
	matchGuid: string;
}
export interface ResumeMatchOutput {
	status: string;
	version: number;
}
