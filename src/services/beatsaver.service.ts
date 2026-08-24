import { config } from "../config";

// Types for the API response
export type BeatSaverMap = {
    id: string;
    metadata: {
        songName: string;
        songAuthorName: string;
        levelAuthorName: string;
        songSubName: string;
        duration: number;
        bpm: number;
    };
    versions: Array<{
        hash: string;
        state: string;
        createdAt: string;
        downloadURL: string;
        diffs: Array<{
            characteristic: string;
            difficulty: string;
            maxScore: number;
            nps: number;
        }>;
        coverURL: string;
        previewURL: string;
    }>;
    uploaded: string;
};

// Return type for map data
export type MapSongData = {
    songName: string;
    songAuthor: string;
    levelAuthor: string;
    subName: string;
    imageUrl: string;
    characteristic: string;
    difficulty: string;
    hash: string;
    key: string;
    maxScore: number;
    length: number;
    nps: number;
    bpm: number;
    mapCreationDate: Date;
    mapUploadDate: Date | null;
};

export abstract class Beatsaver {
    /** Builds a URL for the primary BeatSaver API. */
    private static api(path: string): string {
        return `${config.beatSaverApiUrl}${path}`;
    }

    /** Builds a URL for the configured fallback BeatSaver API. */
    private static fallbackApi(path: string): string {
        return `${config.beatSaverFallbackApiUrl}${path}`;
    }

    /** Normalizes a map hash for internal lookup keys. */
    private static normalizeHash(hash: string): string {
        return hash.trim().toUpperCase();
    }

    /** Normalizes a map hash for BeatSaver request paths. */
    private static normalizeHashForApi(hash: string): string {
        return hash.trim().toLowerCase();
    }

    /** Fetches raw BeatSaver maps in batches while preserving every requested hash. */
    public static async getMapsByHashesRaw(hashes: string[], chunkSize: number = 50): Promise<Record<string, BeatSaverMap | null>> {
        const uniqueHashes = [...new Set(hashes.map((hash) => this.normalizeHash(hash)).filter(Boolean))];
        const results: Record<string, BeatSaverMap | null> = {};

        for (const hash of uniqueHashes) {
            results[hash] = null;
        }

        const effectiveChunkSize = Math.max(1, Math.min(50, Math.floor(chunkSize) || 50));
        const chunks: string[][] = [];
        for (let i = 0; i < uniqueHashes.length; i += effectiveChunkSize) {
            chunks.push(uniqueHashes.slice(i, i + effectiveChunkSize));
        }

        for (const chunk of chunks) {
            const hashListForApi = chunk.map((hash) => this.normalizeHashForApi(hash)).join(",");
            const urls = [this.api(`/maps/hash/${hashListForApi}`), this.fallbackApi(`/maps/hash/${hashListForApi}`)];

            let maps: BeatSaverMap[] = [];

            for (const url of urls) {
                try {
                    const response = await fetch(url);
                    if (!response.ok) {
                        continue;
                    }

                    const data = await response.json();

                    if (Array.isArray(data)) {
                        maps = data as BeatSaverMap[];
                    } else if (Array.isArray(data?.docs)) {
                        maps = data.docs as BeatSaverMap[];
                    } else if (data?.id && Array.isArray(data?.versions)) {
                        maps = [data as BeatSaverMap];
                    } else if (data && typeof data === "object") {
                        maps = Object.values(data).filter((item: any) => item?.id && Array.isArray(item?.versions)) as BeatSaverMap[];
                    }

                    if (maps.length > 0) {
                        break;
                    }
                } catch {}
            }

            for (const requestedHash of chunk) {
                if (results[requestedHash]) {
                    continue;
                }

                const matchedMap = maps.find((map) => (map.versions || []).some((version) => this.normalizeHash(version.hash || "") === requestedHash));

                if (!matchedMap) {
                    continue;
                }

                const fixedMap: BeatSaverMap = {
                    ...matchedMap,
                    versions: (matchedMap.versions || []).map((version, index) => {
                        if (index !== 0) {
                            return version;
                        }

                        return {
                            ...version,
                            hash: requestedHash,
                        };
                    }),
                };

                results[requestedHash] = fixedMap;
            }
        }

        return results;
    }

    /** Fetches one raw BeatSaver map and returns null when the request fails. */
    private static async fetchMap(url: string): Promise<BeatSaverMap | null> {
        try {
            const response = await fetch(url);
            if (!response.ok) return null;
            return await response.json();
        } catch {
            return null;
        }
    }

    /** Fetches normalized song and difficulty data by map hash. */
    public static async getMapByHash(hash: string, characteristic: string, difficulty: string): Promise<MapSongData | null> {
        const mapData = await this.fetchMap(this.api(`/maps/hash/${hash}`));
        if (!mapData) return null;

        const version = mapData.versions.find((x) => x.state === "Published");
        if (!version) return null;
        const diff = version.diffs.find((y) => y.characteristic === characteristic && y.difficulty === difficulty);

        if (!diff) return null;

        return {
            songName: mapData.metadata.songName,
            songAuthor: mapData.metadata.songAuthorName,
            levelAuthor: mapData.metadata.levelAuthorName,
            subName: mapData.metadata.songSubName,
            imageUrl: version.coverURL,
            characteristic,
            difficulty,
            hash,
            key: mapData.id,
            maxScore: diff.maxScore,
            length: mapData.metadata.duration,
            nps: diff.nps,
            bpm: mapData.metadata.bpm,
            mapCreationDate: new Date(mapData.uploaded),
            mapUploadDate: version?.createdAt ? new Date(version.createdAt) : null,
        };
    }

    /** Fetches normalized song and difficulty data by BeatSaver key. */
    public static async getMapByKey(key: string, characteristic: string, difficulty: string): Promise<MapSongData | null> {
        const data = await this.getMapByKeyRaw(key);
        if (!data) return null;

        // Pool submissions intentionally validate the currently playable BeatSaver version.
        const version = data.versions[0];
        if (!version) return null;
        const diff = version?.diffs.find((y) => y.characteristic === characteristic && y.difficulty === difficulty);

        if (!diff) return null;

        return {
            songName: data.metadata.songName,
            songAuthor: data.metadata.songAuthorName,
            levelAuthor: data.metadata.levelAuthorName,
            subName: data.metadata.songSubName,
            imageUrl: version.coverURL,
            characteristic,
            difficulty,
            hash: version.hash,
            key: data.id,
            maxScore: diff.maxScore,
            length: data.metadata.duration,
            nps: diff.nps,
            bpm: data.metadata.bpm,
            mapCreationDate: new Date(data.uploaded),
            mapUploadDate: version?.createdAt ? new Date(version.createdAt) : null,
        };
    }

    /** Fetches the unmodified BeatSaver response for a map key. */
    public static async getMapByKeyRaw(key: string): Promise<BeatSaverMap | null> {
        return await this.fetchMap(this.api(`/maps/id/${key}`));
    }

    /** Fetches the published difficulty metadata for a BeatSaver key. */
    public static async getMapByKeyWithDiffRaw(key: string, characteristic: string, difficulty: string) {
        const data = await this.getMapByKeyRaw(key);
        if (!data) return null;

        const version = data.versions.find((x) => x.state === "Published");
        return version?.diffs.find((y) => y.characteristic === characteristic && y.difficulty === difficulty) || null;
    }

    /** Returns the published download URL for a BeatSaver map key. */
    public static async getMapDownloadUrl(key: string): Promise<string> {
        const mapData = await this.fetchMap(this.api(`/maps/id/${key}`));
        if (!mapData) return "";

        const version = mapData.versions.find((x) => x.state === "Published");
        return version?.downloadURL || "";
    }

    /** Resolves a raw BeatSaver map by key first and hash second. */
    public static async fetchMapFromBeatSaver(identifier: string): Promise<BeatSaverMap | null> {
        try {
            // Try as key first
            let response = await fetch(this.api(`/maps/id/${identifier}`));

            if (response.status === 404) {
                // If not found, try as hash
                response = await fetch(this.api(`/maps/hash/${identifier}`));
            }

            if (!response.ok) {
                return null;
            }

            return await response.json();
        } catch (error) {
            return null;
        }
    }
}
