export const watchMatchEvent = "watchMatch" as const;
export const watchMatchInput = { matchGuid: "uuid" } as const;
export const watchMatchOutput = { watching: "boolean" } as const;

export interface WatchMatchInput { matchGuid: string }
export interface WatchMatchOutput { watching: boolean }
