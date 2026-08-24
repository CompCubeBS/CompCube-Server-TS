export class UpstreamError extends Error {
	constructor(
		public readonly service: string,
		public readonly status: number,
		message: string,
	) {
		super(message);
	}
}

/** Fetches JSON from an upstream service with a timeout and a normalized HTTP error. */
export async function fetchJson<T>(
	service: string,
	url: string,
	init?: RequestInit,
): Promise<T> {
	const response = await fetch(url, {
		...init,
		signal: init?.signal ?? AbortSignal.timeout(10_000),
	});
	if (!response.ok) {
		throw new UpstreamError(
			service,
			response.status,
			`${service} returned HTTP ${response.status}`,
		);
	}
	return response.json() as Promise<T>;
}
