import { and, desc, eq, gt, isNull, or } from "drizzle-orm";
import { db } from "../../db/db";
import { userModerationActions, users } from "../../db/schema";
import { ServiceError } from "./serviceError";

const moderatorPermissions = ["role:moderator", "role:admin", "role:dev"] as const;

class ModerationService {
	/** Returns the active queue restriction for a user, preferring a permanent ban over a timeout. */
	async getActiveRestriction(userGuid: string, now = new Date()) {
		const user = await db.query.users.findFirst({
			columns: { guid: true, banned: true },
			where: eq(users.guid, userGuid),
		});
		if (!user) throw new ServiceError("USER_NOT_FOUND", "User does not exist", 404);
		if (user.banned) return { kind: "ban" as const, endsAt: null };

		const timeout = await db.query.userModerationActions.findFirst({
			where: and(
				eq(userModerationActions.userGuid, userGuid),
				eq(userModerationActions.action, "timeout"),
				isNull(userModerationActions.revokedAt),
				gt(userModerationActions.endsAt, now),
			),
			orderBy: desc(userModerationActions.endsAt),
		});
		return timeout
			? { kind: "timeout" as const, endsAt: timeout.endsAt, action: timeout }
			: null;
	}

	/** Applies a durable temporary timeout and records the moderator and reason. */
	async timeoutUser(
		userGuid: string,
		moderatorUserGuid: string,
		endsAt: Date,
		reason: string,
	) {
		const now = new Date();
		if (!(endsAt instanceof Date) || !Number.isFinite(endsAt.getTime()) || endsAt <= now) {
			throw new ServiceError("INVALID_TIMEOUT", "Timeout end must be in the future", 400);
		}
		if (!reason.trim()) throw new ServiceError("REASON_REQUIRED", "A moderation reason is required", 400);
		return db.transaction(async (tx) => {
			const [target, moderator] = await Promise.all([
				tx.query.users.findFirst({ where: eq(users.guid, userGuid) }),
				tx.query.users.findFirst({ where: eq(users.guid, moderatorUserGuid) }),
			]);
			if (!target) throw new ServiceError("USER_NOT_FOUND", "User does not exist", 404);
			if (!moderator?.permissions.some((permission) => moderatorPermissions.includes(permission as typeof moderatorPermissions[number]))) {
				throw new ServiceError("FORBIDDEN", "A moderator is required", 403);
			}
			const [action] = await tx.insert(userModerationActions).values({
				userGuid,
				moderatorUserGuid,
				action: "timeout",
				reason: reason.trim(),
				startsAt: now,
				endsAt,
			}).returning();
			return action;
		});
	}

	/** Revokes every active timeout while preserving the audit rows. */
	async removeTimeouts(userGuid: string, revokedByUserGuid: string) {
		const now = new Date();
		return db.update(userModerationActions).set({
			revokedAt: now,
			revokedByUserGuid,
		}).where(and(
			eq(userModerationActions.userGuid, userGuid),
			eq(userModerationActions.action, "timeout"),
			isNull(userModerationActions.revokedAt),
			or(isNull(userModerationActions.endsAt), gt(userModerationActions.endsAt, now)),
		)).returning();
	}
}

export const moderationService = new ModerationService();
