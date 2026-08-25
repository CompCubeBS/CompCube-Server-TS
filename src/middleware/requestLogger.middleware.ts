import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

interface LoggedError {
	code: string | null;
	message: string | null;
}

/** Logs one structured line for every REST request without exposing request bodies or credentials. */
export function requestLogger(
	req: Request,
	res: Response,
	next: NextFunction,
): void {
	const requestId = req.get("x-request-id") ?? req.get("cf-ray") ?? randomUUID();
	const startedAt = process.hrtime.bigint();
	let responseError: LoggedError | null = null;
	const sendJson = res.json.bind(res);

	res.setHeader("x-request-id", requestId);
	res.json = ((body: unknown) => {
		if (body && typeof body === "object" && "error" in body) {
			const error = (body as { error?: unknown }).error;
			if (error && typeof error === "object") {
				const details = error as { code?: unknown; message?: unknown };
				responseError = {
					code: typeof details.code === "string" ? details.code : null,
					message: typeof details.message === "string" ? details.message : null,
				};
			}
		}
		return sendJson(body);
	}) as Response["json"];

	res.on("finish", () => {
		const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
		console.info(JSON.stringify({
			timestamp: new Date().toISOString(),
			type: "http_request",
			requestId,
			method: req.method,
			path: req.path,
			status: res.statusCode,
			durationMs: Number(durationMs.toFixed(2)),
			userGuid: req.user?.guid ?? null,
			clientIp: req.ip,
			userAgent: req.get("user-agent") ?? null,
			errorCode: responseError?.code ?? null,
			errorMessage: responseError?.message ?? null,
		}));
	});

	next();
}
