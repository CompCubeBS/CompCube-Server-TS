export const joinQueueEvent = "joinQueue" as const;
export const joinQueueInput = { queue: "string" } as const;
export const joinQueueOutput = {
	queueGuid: "uuid",
	joinedAt: "date-time",
	mmr: "integer",
	matched: "boolean",
	matchGuid: "uuid|null",
} as const;

export interface JoinQueueInput {
	queue: string;
}

export interface JoinQueueOutput {
	queueGuid: string;
	joinedAt: string;
	mmr: number;
	matched: boolean;
	matchGuid: string | null;
}
