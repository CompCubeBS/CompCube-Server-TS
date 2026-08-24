import { and, asc, eq, inArray, lt, lte, or } from "drizzle-orm";
import { db } from "../../db/db";
import { matchTimers, type MatchTimer } from "../../db/schema";
import { config } from "../config";

export type TimerHandler = (timer: MatchTimer) => Promise<void>;

class TimerService {
	private handlers = new Map<MatchTimer["kind"], TimerHandler>();
	private interval?: NodeJS.Timeout;
	private running = false;

	/** Registers the callback that processes a specific durable timer kind. */
	register(kind: MatchTimer["kind"], handler: TimerHandler): void {
		this.handlers.set(kind, handler);
	}

	/** Creates or reschedules a durable timer using an idempotency key. */
	async schedule(input: {
		matchGuid: string;
		kind: MatchTimer["kind"];
		dueAt: Date;
		idempotencyKey: string;
		payload?: Record<string, unknown>;
	}): Promise<MatchTimer> {
		const [timer] = await db
			.insert(matchTimers)
			.values({ ...input, payload: input.payload ?? {} })
			.onConflictDoUpdate({
				target: matchTimers.idempotencyKey,
				set: {
					dueAt: input.dueAt,
					payload: input.payload ?? {},
					status: "scheduled",
					pausedRemainingMs: null,
					updatedAt: new Date(),
				},
			})
			.returning();
		return timer;
	}

	/** Pauses every runnable timer for a match while preserving remaining time. */
	async pauseMatch(matchGuid: string): Promise<void> {
		await db
			.update(matchTimers)
			.set({
				status: "paused",
				pausedRemainingMs: sqlRemainingMilliseconds,
				leaseOwner: null,
				leaseExpiresAt: null,
				updatedAt: new Date(),
			})
			.where(
				and(
					eq(matchTimers.matchGuid, matchGuid),
					inArray(matchTimers.status, ["scheduled", "processing"]),
				),
			);
	}

	/** Resumes every paused timer for a match from its stored remaining time. */
	async resumeMatch(matchGuid: string): Promise<void> {
		await db
			.update(matchTimers)
			.set({
				status: "scheduled",
				dueAt: newDateExpressionFromRemaining,
				pausedRemainingMs: null,
				updatedAt: new Date(),
			})
			.where(
				and(
					eq(matchTimers.matchGuid, matchGuid),
					eq(matchTimers.status, "paused"),
				),
			);
	}

	/** Makes a scheduled or paused timer immediately due. */
	async skip(timerGuid: string, matchGuid: string): Promise<boolean> {
		const timers = await db
			.update(matchTimers)
			.set({
				status: "scheduled",
				dueAt: new Date(),
				pausedRemainingMs: null,
				leaseOwner: null,
				leaseExpiresAt: null,
				updatedAt: new Date(),
			})
			.where(
				and(
					eq(matchTimers.guid, timerGuid),
					eq(matchTimers.matchGuid, matchGuid),
					inArray(matchTimers.status, ["scheduled", "paused"]),
				),
			)
			.returning({ guid: matchTimers.guid });
		if (timers.length) void this.tick();
		return timers.length > 0;
	}

	/** Starts polling and immediately drains timers that became due during downtime. */
	start(): void {
		if (this.interval) return;
		this.interval = setInterval(() => void this.tick(), config.timerPollMs);
		this.interval.unref();
		void this.tick();
	}

	/** Stops polling for due timers. */
	stop(): void {
		if (this.interval) clearInterval(this.interval);
		this.interval = undefined;
	}

	/** Processes every due timer while preventing overlapping polls in one process. */
	private async tick(): Promise<void> {
		if (this.running) return;
		this.running = true;
		try {
			while (await this.processOne()) {
				/* drain overdue timers after a restart */
			}
		} catch (error) {
			// A temporary database outage should not turn into an unhandled rejection.
			console.error("[Timers]: Poll failed", error);
		} finally {
			this.running = false;
		}
	}

	/** Claims and processes one due timer, returning whether the drain loop should continue. */
	private async processOne(): Promise<boolean> {
		const now = new Date();
		const candidate = await db.query.matchTimers.findFirst({
			where:
				and(
					lte(matchTimers.dueAt, now),
					or(
						eq(matchTimers.status, "scheduled"),
						and(
							eq(matchTimers.status, "processing"),
							lt(matchTimers.leaseExpiresAt, now),
						),
					),
				),
			orderBy: asc(matchTimers.dueAt),
		});
		if (!candidate) return false;

		const leaseExpiresAt = new Date(Date.now() + config.timerLeaseMs);
		const [claimed] = await db
			.update(matchTimers)
			.set({
				status: "processing",
				leaseOwner: config.instanceId,
				leaseExpiresAt,
				attempts: candidate.attempts + 1,
				updatedAt: now,
			})
			.where(
				and(
					eq(matchTimers.guid, candidate.guid),
					or(
						eq(matchTimers.status, "scheduled"),
						and(
							eq(matchTimers.status, "processing"),
							lt(matchTimers.leaseExpiresAt, now),
						),
					),
				),
			)
			.returning();
		if (!claimed) return true;

		try {
			const handler = this.handlers.get(claimed.kind);
			if (!handler) {
				throw new Error(
					`No timer handler registered for ${claimed.kind}`,
				);
			}
			await handler(claimed);
			await db
				.update(matchTimers)
				.set({
					status: "completed",
					completedAt: new Date(),
					leaseOwner: null,
					leaseExpiresAt: null,
					updatedAt: new Date(),
				})
				.where(
					and(
						eq(matchTimers.guid, claimed.guid),
						eq(matchTimers.status, "processing"),
						eq(matchTimers.leaseOwner, config.instanceId),
					),
				);
		} catch (error) {
			const failed = claimed.attempts >= 5;
			await db
				.update(matchTimers)
				.set({
					status: failed ? "failed" : "scheduled",
					dueAt: failed
						? claimed.dueAt
						: new Date(
								Date.now() +
									Math.min(
										30_000,
										1000 * 2 ** claimed.attempts,
									),
							),
					lastError:
						error instanceof Error
							? error.message.slice(0, 4000)
							: String(error),
					leaseOwner: null,
					leaseExpiresAt: null,
					updatedAt: new Date(),
				})
				.where(
					and(
						eq(matchTimers.guid, claimed.guid),
						eq(matchTimers.status, "processing"),
						eq(matchTimers.leaseOwner, config.instanceId),
					),
				);
		}
		return true;
	}
}

import { sql } from "drizzle-orm";
const sqlRemainingMilliseconds = sql<number>`GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (${matchTimers.dueAt} - now())) * 1000))::integer`;
const newDateExpressionFromRemaining = sql<Date>`now() + (${matchTimers.pausedRemainingMs} * interval '1 millisecond')`;

export const timerService = new TimerService();
