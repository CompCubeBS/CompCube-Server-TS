import { config } from "../config";
import { fetchJson } from "./httpJson.service";

export interface ScoreSaberPlayer {
    id: string;
    name: string;
    profilePicture: string;
    country: string;
    pp: number;
    rank: number;
    countryRank: number;
    histories?: string;
    permissions?: number;
    banned?: boolean;
    inactive?: boolean;
}

export const scoreSaberService = {
    /** Fetches the public ScoreSaber profile for a platform ID. */
    getPlayer(id: string): Promise<ScoreSaberPlayer> {
        return fetchJson("ScoreSaber", `${config.scoreSaberApiUrl}/player/${encodeURIComponent(id)}/basic`);
    },
};
