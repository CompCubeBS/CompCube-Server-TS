export const clientDisconnectEvent = "clientDisconnect" as const;
export const clientDisconnectInput = {} as const;
export const clientDisconnectOutput = {
	removedFromQueue: "boolean",
	forfeitedMatchGuid: "uuid|null",
} as const;

export type ClientDisconnectInput = Record<string, never>;

export interface ClientDisconnectOutput {
	removedFromQueue: boolean;
	forfeitedMatchGuid: string | null;
}
