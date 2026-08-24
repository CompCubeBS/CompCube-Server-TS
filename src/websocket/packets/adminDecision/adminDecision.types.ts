export const adminDecisionEvent = "adminDecision" as const;
export const adminDecisionInput = {
	matchGuid: "uuid",
	action: "force_pick|force_score|forfeit|abort|set_health|declare_winner",
	targetUserGuid: "uuid?",
	payload: "object",
	reason: "string",
} as const;
export const adminDecisionOutput = { accepted: "boolean" } as const;
export interface AdminDecisionInput {
	matchGuid: string;
	action: "force_pick" | "force_score" | "forfeit" | "abort" | "set_health" | "declare_winner";
	targetUserGuid?: string;
	payload?: Record<string, unknown>;
	reason: string;
}
export interface AdminDecisionOutput {
	accepted: boolean;
}
