import { config } from "../config";
import { fetchJson } from "./httpJson.service";

export interface BeatLeaderPlayer {
    id: string;
    name: string;
    avatar: string;
    country: string;
    pp: number;
    rank: number;
    countryRank: number;
    scoreStats?: {
        totalScore: number;
        totalRankedScore: number;
        averageRankedAccuracy: number;
        topAccuracy: number;
        rankedPlayCount: number;
    };
}

export const beatLeaderService = {
    /** Fetches the public BeatLeader profile for a platform ID. */
    getPlayer(id: string): Promise<BeatLeaderPlayer> {
        return fetchJson("BeatLeader", `${config.beatLeaderApiUrl}/player/${encodeURIComponent(id)}`);
    },
};
