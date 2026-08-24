export const beatKhanaRequiredScope = "rest:user:read" as const;

export interface BeatKhanaTokenResponse {
    access_token: string;
    token_type: string;
    expires_in: number;
    refresh_token: string;
    scope: string;
}

export interface BeatKhanaOAuthUserInfo {
    sub: string;
    preferred_username: string;
    discord_id: string;
    beatkhana_user_guid: string;
}

export interface BeatKhanaUser {
    guid: string;
    username: string;
    preferredName?: string | null;
    discordId: string;
    avatarUrl?: string | null;
    permissions?: string[];
    blSteamId?: string | null;
    ssSteamId?: string | null;
    blOculusPCId?: string | null;
    ssOculusPCId?: string | null;
    blQuestId?: string | null;
    ssQuestId?: string | null;
}

export interface BeatKhanaTokenClaims {
    guid: string | null;
    id: string | null;
    discordId?: string | null;
    username: string;
    avatarUrl?: string | null;
    global_name?: string | null;
    platform?: string;
    platformId?: string;
    platformIds?: string[];
    tokenType?: "beatkhana:game";
    scopes: string[];
    scope?: string;
    iat: number;
    exp: number;
    nbf?: number;
}

/** Returns unique BeatKhana platform IDs in Steam, Oculus PC and standalone priority order. */
export function prioritizedPlatformIds(user: BeatKhanaUser): string[] {
    // Preserve the established order: Steam, Oculus PC, standalone; BeatLeader before ScoreSaber.
    return [user.blSteamId, user.ssSteamId, user.blOculusPCId, user.ssOculusPCId, user.blQuestId, user.ssQuestId]
        .filter((value): value is string => Boolean(value?.trim()))
        // fancy way of saying [0]
        .filter((value, index, all) => all.indexOf(value) === index);
}
