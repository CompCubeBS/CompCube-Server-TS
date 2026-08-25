import express, { Router } from "express";
import { config } from "../config";
import { pluginReleaseService } from "../services/pluginRelease.service";

const router = Router();

/**
 * @openapi
 * /plugin-releases:
 *   get:
 *     tags: [Plugin Releases]
 *     summary: List published PCVR plugin builds
 *     description: Returns the newest served plugin version and one current DLL release per supported Beat Saber game version. This endpoint is public and drives the website's home and download pages.
 *     operationId: getPluginReleases
 *     responses:
 *       200:
 *         description: Published plugin release metadata, newest first.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [servedPluginVersion, releases]
 *               properties:
 *                 servedPluginVersion:
 *                   type: string
 *                   nullable: true
 *                   description: Plugin package version of the newest upload, or null when no DLL has been published.
 *                   example: "0.2.1"
 *                 releases:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/PluginRelease'
 *       500:
 *         description: The persisted release manifest could not be read.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiError'
 */
router.get("/plugin-releases", async (_req, res) => {
	const releases = await pluginReleaseService.list();
	res.json({
		servedPluginVersion: releases[0]?.pluginVersion ?? null,
		releases,
	});
});

/**
 * @openapi
 * /plugin-releases/{gameVersion}/download:
 *   get:
 *     tags: [Plugin Releases]
 *     summary: Download the published DLL for a Beat Saber version
 *     description: Serves the exact backend-managed PCVR plugin binary as an attachment. Use the response checksum to verify the downloaded file.
 *     operationId: downloadPluginRelease
 *     parameters:
 *       - in: path
 *         name: gameVersion
 *         required: true
 *         description: Semantic Beat Saber version targeted by the DLL.
 *         schema:
 *           type: string
 *           pattern: '^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$'
 *           example: "1.40.8"
 *     responses:
 *       200:
 *         description: The published Windows DLL.
 *         headers:
 *           Content-Disposition:
 *             description: Attachment filename, for example CompCube-bs1.40.8.dll.
 *             schema: { type: string }
 *           X-CompCube-Plugin-Version:
 *             description: CompCube package version contained in the build.
 *             schema: { type: string, example: "0.2.1" }
 *           X-Checksum-SHA256:
 *             description: Lowercase hexadecimal SHA-256 digest of the response file.
 *             schema: { type: string, pattern: '^[0-9a-f]{64}$' }
 *         content:
 *           application/octet-stream:
 *             schema:
 *               type: string
 *               format: binary
 *       404:
 *         description: No manifest entry or binary exists for this game version.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiError'
 *       500:
 *         description: The release manifest could not be read.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiError'
 */
router.get("/plugin-releases/:gameVersion/download", async (req, res) => {
	const file = await pluginReleaseService.filePath(req.params.gameVersion);
	res.set({
		"Cache-Control": "public, max-age=300",
		"X-CompCube-Plugin-Version": file.release.pluginVersion,
		"X-Checksum-SHA256": file.release.sha256,
	});
	res.download(file.path, file.release.fileName);
});

/**
 * @openapi
 * /internal/plugin-releases/{gameVersion}:
 *   post:
 *     tags: [Plugin Releases]
 *     summary: Publish or replace a PCVR plugin build
 *     description: Protected CI endpoint used by the CompCube plugin workflow. It atomically stores the DLL, computes SHA-256, and replaces the manifest slot for the supplied Beat Saber version. It is not intended for browser clients.
 *     operationId: publishPluginRelease
 *     security:
 *       - PluginUploadToken: []
 *     parameters:
 *       - in: path
 *         name: gameVersion
 *         required: true
 *         description: Semantic Beat Saber version targeted by the DLL.
 *         schema:
 *           type: string
 *           pattern: '^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$'
 *           example: "1.40.8"
 *       - in: header
 *         name: X-CompCube-Plugin-Version
 *         required: true
 *         description: Semantic CompCube package version extracted from Directory.Build.props.
 *         schema:
 *           type: string
 *           pattern: '^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$'
 *           example: "0.2.1"
 *     requestBody:
 *       required: true
 *       description: Raw Windows DLL. The maximum size is controlled by PLUGIN_UPLOAD_MAX_BYTES (25 MiB by default), and the file must begin with the MZ executable header.
 *       content:
 *         application/octet-stream:
 *           schema:
 *             type: string
 *             format: binary
 *     responses:
 *       201:
 *         description: The release was published and its public metadata is returned.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PluginRelease'
 *       400:
 *         description: A version is invalid or the request body is empty, oversized, or not a Windows DLL.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiError'
 *       401:
 *         description: The bearer upload token is missing or invalid.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiError'
 *       413:
 *         description: The raw request body exceeds the configured upload limit.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiError'
 *       503:
 *         description: PLUGIN_UPLOAD_SECRET is not configured, so CI publishing is disabled.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiError'
 */
router.post(
	"/internal/plugin-releases/:gameVersion",
	express.raw({ type: "application/octet-stream", limit: config.pluginUploadMaxBytes }),
	async (req, res) => {
		pluginReleaseService.verifyUploadSecret(req.header("authorization")?.replace(/^Bearer\s+/i, ""));
		const pluginVersion = req.header("x-compcube-plugin-version")?.trim() ?? "";
		const release = await pluginReleaseService.publish(req.params.gameVersion, pluginVersion, req.body as Buffer);
		res.status(201).json(release);
	},
);

export default router;
