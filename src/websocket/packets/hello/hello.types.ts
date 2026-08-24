export const helloEvent = "hello" as const;
export const helloInput = { message: "string?" } as const;
export const helloOutput = {
	message: "string",
	userGuid: "uuid|null",
	serverTime: "date-time",
} as const;
export interface HelloInput {
	message?: string;
}
export interface HelloOutput {
	message: string;
	userGuid: string | null;
	serverTime: string;
}
