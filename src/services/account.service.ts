import { and, eq, gt, inArray, isNull, lte, or } from "drizzle-orm";
import { db } from "../../db/db";
import {
	competitiveStatistics,
	seasons,
	users,
	type User,
} from "../../db/schema";
import { prioritizedPlatformIds, type BeatKhanaTokenClaims, type BeatKhanaUser } from "./beatkhana.types";

export interface AccountResult {
	user: User;
	canQueue: boolean;
	linkingUrl: string | null;
}

/** Selects the safest platform ID for a BeatKhana login without replacing a confirmed matching plugin ID. */
export function beatKhanaPlatformId(
	existingPlatformId: string | null,
	platformIds: string[],
): string | null {
	// If the plugin already gave us an id that BeatKhana knows about, keep it.
	// Otherwise BeatKhana is only a fallback and we use its normal priority order.
	if (existingPlatformId && platformIds.includes(existingPlatformId)) {
		return existingPlatformId;
	}
	return platformIds[0] ?? existingPlatformId;
}

/** Preserves local roles, perks and bans when duplicate identities are reconciled. */
export function mergeLocalAuthorization(
	accounts: Array<Pick<User, "permissions" | "banned">>,
): Pick<User, "permissions" | "banned"> {
	return {
		permissions: [
			...new Set(accounts.flatMap((account) => account.permissions)),
		],
		banned: accounts.some((account) => account.banned),
	};
}

/** Finds the season that is both marked current and active at this moment. */
async function currentSeasonGuid(
	executor: Pick<typeof db, "query">,
): Promise<string | null> {
	const now = new Date();
	const season = await executor.query.seasons.findFirst({
		columns: { guid: true },
		where:
			and(
				eq(seasons.isCurrent, true),
				lte(seasons.startsAt, now),
				or(isNull(seasons.endsAt), gt(seasons.endsAt, now)),
			),
	});
	return season?.guid ?? null;
}

class AccountService {
	/** Creates or reconciles an account from a verified BeatKhana profile and an optional trusted plugin ID. */
	async upsertFromBeatKhana(
		profile: BeatKhanaUser,
		linkingUrl: string,
		pluginPlatformId?: string | null,
		verifiedPlatformIds: string[] = [],
	): Promise<AccountResult> {
		const platformIds = [...new Set([...verifiedPlatformIds, ...prioritizedPlatformIds(profile)].map((id) => id.trim()).filter(Boolean))];
		const trustedPluginPlatformId = pluginPlatformId?.trim() || null;
		const lookupPlatformIds = trustedPluginPlatformId
			? [trustedPluginPlatformId, ...platformIds.filter((id) => id !== trustedPluginPlatformId)]
			: platformIds;

		const user = await db.transaction(async (tx) => {
			const platformUsers = lookupPlatformIds.length
				? await tx.query.users.findMany({
						where: inArray(users.platformId, lookupPlatformIds),
					})
				: [];
			const platformUser = lookupPlatformIds
				.map((id) => platformUsers.find((user) => user.platformId === id))
				.find((user): user is User => Boolean(user));
			const discordUser = await tx.query.users.findFirst({
				where: eq(users.discordId, profile.discordId),
			});
			const existingBeatKhanaUser = await tx.query.users.findFirst({
				where: eq(users.beatKhanaGuid, profile.guid),
			});

			let canonical = platformUser ?? existingBeatKhanaUser ?? discordUser;
			if (canonical) {
				const canonicalGuid = canonical.guid;
				const duplicateUsers = [discordUser, existingBeatKhanaUser]
					.filter(
						(candidate): candidate is User =>
							Boolean(candidate && candidate.guid !== canonicalGuid),
					)
					.filter(
						(candidate, index, values) =>
							values.findIndex((value) => value.guid === candidate.guid) === index,
					);
				const authorization = mergeLocalAuthorization([
					canonical,
					...duplicateUsers,
				]);

				for (const duplicate of duplicateUsers) {
					if (!duplicate.platformId) {
						// Accounts created only by a previous web login have no gameplay data and can be removed.
						await tx.delete(users).where(eq(users.guid, duplicate.guid));
						continue;
					}
					// Keep gameplay records on a second platform account, but move the login identities to the canonical account.
					await tx
						.update(users)
						.set({
							...(duplicate.discordId === profile.discordId ? { discordId: null } : {}),
							...(duplicate.beatKhanaGuid === profile.guid ? { beatKhanaGuid: null } : {}),
							updatedAt: new Date(),
						})
						.where(eq(users.guid, duplicate.guid));
				}

				[canonical] = await tx
					.update(users)
					.set({
						beatKhanaGuid: profile.guid,
						discordId: profile.discordId,
						// A platform id received from the running plugin is authoritative.
						platformId:
							trustedPluginPlatformId ??
							beatKhanaPlatformId(canonical.platformId, platformIds),
						username: profile.username,
						avatarUrl: profile.avatarUrl ?? canonical.avatarUrl,
						// CompCube permissions are managed locally and must survive every login and token validation.
						permissions: authorization.permissions,
						banned: authorization.banned,
						updatedAt: new Date(),
					})
					.where(eq(users.guid, canonical.guid))
					.returning();
			} else {
				[canonical] = await tx
					.insert(users)
					.values({
						beatKhanaGuid: profile.guid,
						discordId: profile.discordId,
						platformId: trustedPluginPlatformId ?? platformIds[0] ?? null,
						username: profile.username,
						avatarUrl: profile.avatarUrl,
						permissions: ["role:player"],
					})
					.returning();
			}

			const seasonGuid = await currentSeasonGuid(tx);
			if (seasonGuid) {
				await tx
					.insert(competitiveStatistics)
					.values({ userGuid: canonical.guid, seasonGuid })
					.onConflictDoNothing();
			}
			return canonical;
		});
		return {
			user,
			canQueue: Boolean(user.platformId) && !user.banned,
			linkingUrl: user.platformId ? null : linkingUrl,
		};
	}

	/** Reconciles an account using only locally verified claims from a signed BeatKhana token. */
	async upsertFromBeatKhanaToken(
		claims: BeatKhanaTokenClaims,
		linkingUrl: string,
	): Promise<AccountResult> {
		const platformIds = [...new Set([claims.platformId, ...(claims.platformIds ?? [])].filter((id): id is string => Boolean(id)))];
		if (claims.guid && claims.discordId) {
			return this.upsertFromBeatKhana(
				{
					guid: claims.guid,
					discordId: claims.discordId,
					username: claims.global_name?.trim() || claims.username,
					avatarUrl: claims.avatarUrl,
				},
				linkingUrl,
				claims.platformId,
				platformIds,
			);
		}
		if (!claims.platformId) throw new Error("BeatKhana token has no usable account identity");
		const user = await this.upsertPluginAccount(claims.platformId, claims.username);
		return { user, canQueue: !user.banned, linkingUrl: null };
	}

	/** Creates or refreshes a platform-only account authenticated by the game plugin. */
	async upsertPluginAccount(
		platformId: string,
		username: string,
	): Promise<User> {
		return db.transaction(async (tx) => {
			const existing = await tx.query.users.findFirst({
				where: eq(users.platformId, platformId),
			});
			const [user] = existing
				? await tx
						.update(users)
						.set({ username, updatedAt: new Date() })
						.where(eq(users.guid, existing.guid))
						.returning()
				: await tx
						.insert(users)
						.values({ platformId, username })
						.returning();
			const seasonGuid = await currentSeasonGuid(tx);
			if (seasonGuid) {
				await tx
					.insert(competitiveStatistics)
					.values({ userGuid: user.guid, seasonGuid })
					.onConflictDoNothing();
			}
			return user;
		});
	}

	/** Finds an account by its internal GUID. */
	async getByGuid(guid: string): Promise<User | null> {
		const user = await db.query.users.findFirst({
			where: eq(users.guid, guid),
		});
		return user ?? null;
	}
}

export const accountService = new AccountService();
