import { eq } from "drizzle-orm";
import { db } from "../../db/db";
import { users, type User } from "../../db/schema";
import { config } from "../config";
import { accountService } from "./account.service";
import { beatKhanaService } from "./beatkhana.service";

const requiredAccounts = [
	{ discordId: "571465453608894466", name: "Bela" },
	{ discordId: "469171963236057120", name: "Luna" },
] as const;

const requiredPermissions: User["permissions"] = ["role:admin", "role:dev"];

class StartupService {
	/** Creates the permanent administrators from BeatKhana and restores their required local roles. */
	async ensureRequiredAccounts(): Promise<void> {
		for (const requiredAccount of requiredAccounts) {
			const profile = await beatKhanaService.getUser(requiredAccount.discordId);
			if (profile.discordId !== requiredAccount.discordId) {
				throw new Error(
					`BeatKhana returned the wrong Discord account for ${requiredAccount.name}`,
				);
			}

			const account = await accountService.upsertFromBeatKhana(
				{
					...profile,
					// BeatKhana's preferred name is what should be shown throughout CompCube.
					username: profile.preferredName?.trim() || profile.username,
				},
				config.beatKhana.linkingUrl,
			);
			const permissions = [
				...new Set([...account.user.permissions, ...requiredPermissions]),
			];

			await db
				.update(users)
				.set({ permissions, updatedAt: new Date() })
				.where(eq(users.guid, account.user.guid));
			console.info(
				`[Startup]: Ensured ${requiredAccount.name} has role:admin and role:dev`,
			);
		}
	}
}

export const startupService = new StartupService();
