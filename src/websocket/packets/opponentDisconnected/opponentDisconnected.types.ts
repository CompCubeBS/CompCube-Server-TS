export const opponentDisconnectedEvent = "opponentDisconnected" as const;
export const opponentDisconnectedOutput = {
	matchGuid: "uuid",
	userGuid: "uuid",
	graceEndsAt: "date-time|null",
} as const;
export interface OpponentDisconnectedOutput {
	matchGuid: string;
	userGuid: string;
	graceEndsAt: string | null;
}
