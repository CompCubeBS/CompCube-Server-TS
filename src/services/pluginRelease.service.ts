import { createHash, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { config } from "../config";
import { ServiceError } from "./serviceError";

export interface PluginRelease {
	gameVersion: string;
	pluginVersion: string;
	fileName: string;
	sha256: string;
	size: number;
	uploadedAt: string;
	downloadUrl: string;
}

type StoredRelease = Omit<PluginRelease, "downloadUrl">;
type ReleaseManifest = { releases: StoredRelease[] };

const versionPattern = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;

class PluginReleaseService {
	private readonly manifestPath = path.join(config.pluginReleaseDirectory, "manifest.json");
	private publishing: Promise<void> = Promise.resolve();

	private async readManifest(): Promise<ReleaseManifest> {
		try {
			const parsed = JSON.parse(await readFile(this.manifestPath, "utf8")) as ReleaseManifest;
			return { releases: Array.isArray(parsed.releases) ? parsed.releases : [] };
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") return { releases: [] };
			throw error;
		}
	}

	private downloadUrl(gameVersion: string): string {
		return `${config.publicApiUrl}/plugin-releases/${encodeURIComponent(gameVersion)}/download`;
	}

	async list(): Promise<PluginRelease[]> {
		const manifest = await this.readManifest();
		return manifest.releases
			.sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt))
			.map((release) => ({ ...release, downloadUrl: this.downloadUrl(release.gameVersion) }));
	}

	async get(gameVersion: string): Promise<StoredRelease | null> {
		const manifest = await this.readManifest();
		return manifest.releases.find((release) => release.gameVersion === gameVersion) ?? null;
	}

	verifyUploadSecret(candidate: string | undefined): void {
		if (!config.pluginUploadSecret) {
			throw new ServiceError("PLUGIN_UPLOAD_DISABLED", "Plugin uploads are not configured", 503);
		}
		const expected = Buffer.from(config.pluginUploadSecret);
		const provided = Buffer.from(candidate ?? "");
		if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) {
			throw new ServiceError("INVALID_UPLOAD_TOKEN", "The plugin upload token is invalid", 401);
		}
	}

	async publish(gameVersion: string, pluginVersion: string, body: Buffer): Promise<PluginRelease> {
		const operation = this.publishing.then(() => this.publishNow(gameVersion, pluginVersion, body));
		this.publishing = operation.then(() => undefined, () => undefined);
		return operation;
	}

	private async publishNow(gameVersion: string, pluginVersion: string, body: Buffer): Promise<PluginRelease> {
		if (!versionPattern.test(gameVersion) || !versionPattern.test(pluginVersion)) {
			throw new ServiceError("INVALID_VERSION", "Game and plugin versions must be semantic versions", 400);
		}
		if (!body.length || body.length > config.pluginUploadMaxBytes) {
			throw new ServiceError("INVALID_PLUGIN_FILE", "The DLL is empty or exceeds the upload limit", 400);
		}
		if (body.subarray(0, 2).toString("ascii") !== "MZ") {
			throw new ServiceError("INVALID_PLUGIN_FILE", "The upload is not a Windows DLL", 400);
		}

		await mkdir(config.pluginReleaseDirectory, { recursive: true });
		const fileName = `CompCube-bs${gameVersion}.dll`;
		const finalPath = path.join(config.pluginReleaseDirectory, fileName);
		const temporaryPath = `${finalPath}.${process.pid}.tmp`;
		await writeFile(temporaryPath, body, { mode: 0o644 });
		await rename(temporaryPath, finalPath);

		const release: StoredRelease = {
			gameVersion,
			pluginVersion,
			fileName,
			sha256: createHash("sha256").update(body).digest("hex"),
			size: body.length,
			uploadedAt: new Date().toISOString(),
		};
		const manifest = await this.readManifest();
		manifest.releases = [release, ...manifest.releases.filter((item) => item.gameVersion !== gameVersion)];
		const temporaryManifest = `${this.manifestPath}.${process.pid}.tmp`;
		await writeFile(temporaryManifest, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o644 });
		await rename(temporaryManifest, this.manifestPath);
		return { ...release, downloadUrl: this.downloadUrl(gameVersion) };
	}

	async filePath(gameVersion: string): Promise<{ release: StoredRelease; path: string }> {
		const release = await this.get(gameVersion);
		if (!release) throw new ServiceError("PLUGIN_RELEASE_NOT_FOUND", "No plugin is published for this game version", 404);
		const releasePath = path.join(config.pluginReleaseDirectory, release.fileName);
		try {
			await stat(releasePath);
		} catch {
			throw new ServiceError("PLUGIN_FILE_NOT_FOUND", "The published plugin file is unavailable", 404);
		}
		return { release, path: releasePath };
	}
}

export const pluginReleaseService = new PluginReleaseService();
