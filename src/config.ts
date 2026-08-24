import "dotenv/config";
import { randomUUID } from "node:crypto";

function url(name: string, fallback: string): string {
    const value = process.env[name]?.trim() || fallback;
    return value.replace(/\/$/, "");
}

function number(name: string, fallback: number): number {
    const value = Number(process.env[name] ?? fallback);
    if (!Number.isFinite(value) || value < 0) throw new Error(`${name} must be a non-negative number`);
    return value;
}

function csv(name: string, fallback = ""): string[] {
	return [...new Set((process.env[name] ?? fallback).split(",").map((value) => value.trim()).filter(Boolean))];
}

export const config = {
    nodeEnv: process.env.NODE_ENV ?? "development",
    restPort: number("REST_PORT", 7198),
    wsPort: number("WS_PORT", 8008),
    databaseUrl: process.env.PGCONNECTSTRING ?? "postgres://compcube:compcube@localhost:5432/compcube",
    publicApiUrl: url("PUBLIC_API_URL", "http://localhost:7198"),
    websiteUrl: url("WEBSITE_URL", "http://localhost:5173"),
    corsOrigin: process.env.CORS_ORIGIN ?? "*",
    authCookieDomain: process.env.AUTH_COOKIE_DOMAIN?.trim() || undefined,
    beatKhana: {
        clientId: process.env.BK_CLIENT_ID?.trim() ?? "",
        clientSecret: process.env.BK_CLIENT_SECRET?.trim() ?? "",
        apiUrl: url("BK_API_URL", "https://api.beatkhana.com/api"),
        authorizeUrl: url("BK_AUTHORIZE_URL", "https://api.beatkhana.com/api/oauth/authorize"),
        callbackUrl: url("BK_CALLBACK_URL", "http://localhost:7198/oauth/callback"),
        linkingUrl: process.env.BK_LINKING_URL?.trim() || "https://beatkhana.com/users/@me/settings#linking",
        // CompCube access tokens must always be issued for CompCube. Making this configurable
        // allowed the login flow to request a different scope which its own verifier rejected.
        scope: "compcube",
        publicKeyUrl: url("BK_PUBLIC_KEY_URL", `${url("BK_API_URL", "https://api.beatkhana.com/api")}/requestPublicSignature`),
    },
    beatLeaderApiUrl: url("BEATLEADER_API_URL", "https://api.beatleader.xyz"),
    scoreSaberApiUrl: url("SCORESABER_API_URL", "https://scoresaber.com/api"),
    beatSaverApiUrl: url("BEATSAVER_API_URL", "https://api.beatsaver.com"),
	beatSaverFallbackApiUrl: url("BEATSAVER_FALLBACK_API_URL", "https://beatsaver.com/api"),
	pluginVersions: csv("PLUGIN_VERSIONS"),
    discordToken: process.env.DISCORD_TOKEN?.trim() ?? "",
    discordClientId: process.env.DISCORD_CLIENT_ID?.trim() ?? "",
    discordGuildId: process.env.DISCORD_GUILD_ID?.trim() || undefined,
    timerPollMs: number("TIMER_POLL_MS", 1000),
	timerLeaseMs: number("TIMER_LEASE_MS", 30_000),
	discardSeconds: number("DISCARD_SECONDS", 60),
	pickSeconds: number("PICK_SECONDS", 45),
    instanceId: process.env.INSTANCE_ID?.trim() || `${process.pid}-${randomUUID()}`,
} as const;

/** Throws during OAuth requests when required BeatKhana credentials are missing. */
export function assertOAuthConfigured(): void {
    if (!config.beatKhana.clientId || !config.beatKhana.clientSecret) {
        throw new Error("BeatKhana OAuth requires BK_CLIENT_ID and BK_CLIENT_SECRET");
    }
}
