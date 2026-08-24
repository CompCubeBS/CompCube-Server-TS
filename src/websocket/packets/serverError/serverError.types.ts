export const serverErrorEvent = "serverError" as const;
export const serverErrorOutput = {
	code: "string",
	message: "string",
	recoverable: "boolean",
} as const;
export interface ServerErrorOutput {
	code: string;
	message: string;
	recoverable: boolean;
}
