/** A safe, user-facing service failure that can be returned through HTTP or packet acknowledgements. */
export class ServiceError extends Error {
	constructor(
		public readonly code: string,
		message: string,
		public readonly status = 400,
	) {
		super(message);
	}
}
