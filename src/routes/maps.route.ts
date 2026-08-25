import { Router } from "express";
import { eq } from "drizzle-orm";
import { db } from "../../db/db";
import { maps, seasonPools } from "../../db/schema";
import { requireAuth } from "../middleware/auth.middleware";
import { Beatsaver } from "../services/beatsaver.service";

const router = Router();

/**
 * @openapi
 * /maps/hashes:
 *   get:
 *     tags: [Maps]
 *     summary: "List distinct map hashes"
 *     description: "This endpoint is public."
 *     operationId: getMapsHashes
 *     responses:
 *       200:
 *         description: The request completed successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               additionalProperties: true
 *       400:
 *         description: The request was invalid.
 *       401:
 *         description: Authentication is required when the endpoint is protected.
 *       403:
 *         description: The authenticated account does not have the required permission.
 *       404:
 *         description: The requested resource was not found.
 *       409:
 *         description: The request conflicts with the current resource state.
 */
router.get("/maps/hashes", async (_req, res) => {
	const rows = await db.query.maps.findMany({ columns: { hash: true } });
	res.json([...new Set(rows.map((row) => row.hash))]);
});

/**
 * @openapi
 * /maps/playlist:
 *   get:
 *     tags: [Maps]
 *     summary: "Download the public CompCube playlist"
 *     description: "This endpoint is public."
 *     operationId: getMapsPlaylist
 *     responses:
 *       200:
 *         description: The request completed successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               additionalProperties: true
 *       400:
 *         description: The request was invalid.
 *       401:
 *         description: Authentication is required when the endpoint is protected.
 *       403:
 *         description: The authenticated account does not have the required permission.
 *       404:
 *         description: The requested resource was not found.
 *       409:
 *         description: The request conflicts with the current resource state.
 */
router.get("/maps/playlist", async (_req, res) => {
	const rows = await db.query.maps.findMany();
	res.json({
		playlistTitle: "CompCube",
		playlistAuthor: "CompCube",
		songs: rows.map((map) => ({
			hash: map.hash,
			key: map.key,
			songName: map.name,
			difficulties: [{
				characteristic: map.characteristic,
				name: map.difficulty,
			}],
		})),
	});
});

/**
 * @openapi
 * /maps/download/{hash}:
 *   get:
 *     tags: [Maps]
 *     summary: "Download a cached map archive"
 *     description: "This endpoint is public."
 *     operationId: getMapsDownloadByHash
 *     parameters:
 *       - in: path
 *         name: hash
 *         required: true
 *         description: "Identifies the hash resource."
 *         schema:
 *           type: string
 *     responses:
 *       302:
 *         description: Redirects to the requested resource.
 *       400:
 *         description: The request was invalid.
 *       401:
 *         description: Authentication is required when the endpoint is protected.
 *       403:
 *         description: The authenticated account does not have the required permission.
 *       404:
 *         description: The requested resource was not found.
 *       409:
 *         description: The request conflicts with the current resource state.
 */
router.get("/maps/download/:hash", async (req, res) => {
	const map = await db.query.maps.findFirst({
		columns: { key: true },
		where: eq(maps.hash, req.params.hash.toUpperCase()),
	});
	if (!map) {
		res.status(404).json({ error: { code: "MAP_NOT_FOUND", message: "Map does not exist" } });
		return;
	}

	const downloadUrl = await Beatsaver.getMapDownloadUrl(map.key);
	if (!downloadUrl) {
		res.status(502).json({ error: { code: "BEATSAVER_UNAVAILABLE", message: "BeatSaver did not return a download URL" } });
		return;
	}
	res.redirect(downloadUrl);
});

/**
 * @openapi
 * /pools/{poolGuid}/maps:
 *   get:
 *     tags: [Maps]
 *     summary: "List maps in a pool"
 *     description: "This endpoint is public."
 *     operationId: getPoolsByPoolGuidMaps
 *     parameters:
 *       - in: path
 *         name: poolGuid
 *         required: true
 *         description: "Identifies the poolGuid resource."
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: The request completed successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               additionalProperties: true
 *       400:
 *         description: The request was invalid.
 *       401:
 *         description: Authentication is required when the endpoint is protected.
 *       403:
 *         description: The authenticated account does not have the required permission.
 *       404:
 *         description: The requested resource was not found.
 *       409:
 *         description: The request conflicts with the current resource state.
 */
router.get("/pools/:poolGuid/maps", async (req, res) => {
	res.json(await db.query.maps.findMany({
		where: eq(maps.poolGuid, req.params.poolGuid),
		with: { category: true },
	}));
});

/**
 * @openapi
 * /pools/{poolGuid}/maps:
 *   post:
 *     tags: [Maps]
 *     summary: "Add a map to a pool"
 *     description: "This endpoint requires an authenticated administrator."
 *     operationId: postPoolsByPoolGuidMaps
 *     security:
 *       - BeatKhanaAuth: []
 *     x-required-roles:
 *       - admin
 *     parameters:
 *       - in: path
 *         name: poolGuid
 *         required: true
 *         description: "Identifies the poolGuid resource."
 *         schema:
 *           type: string
 *     requestBody:
 *       required: false
 *       description: Request payload reserved for the endpoint implementation.
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             additionalProperties: true
 *     responses:
 *       201:
 *         description: The resource was created.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               additionalProperties: true
 *       400:
 *         description: The request was invalid.
 *       401:
 *         description: Authentication is required when the endpoint is protected.
 *       403:
 *         description: The authenticated account does not have the required permission.
 *       404:
 *         description: The requested resource was not found.
 *       409:
 *         description: The request conflicts with the current resource state.
 */
router.post("/pools/:poolGuid/maps", requireAuth, async (req, res) => {
	if (!req.user?.permissions.some((permission) =>
		["role:pooler", "role:admin", "role:dev"].includes(permission)
	)) {
		res.status(403).json({ error: { code: "FORBIDDEN", message: "A map pooler is required" } });
		return;
	}

	const { key, characteristic, difficulty, modifiers, categoryGuid } = req.body as {
		key?: string;
		characteristic?: string;
		difficulty?: string;
		modifiers?: string[];
		categoryGuid?: string | null;
	};
	if (!key || !characteristic || !difficulty || !Array.isArray(modifiers)) {
		res.status(400).json({ error: { code: "INVALID_MAP", message: "key, characteristic, difficulty and modifiers are required" } });
		return;
	}
	if (["SS", "FS", "SFS"].filter((modifier) => modifiers.includes(modifier)).length > 1) {
		res.status(400).json({ error: { code: "INVALID_MODIFIERS", message: "Only one speed-changing modifier is allowed" } });
		return;
	}

	const pool = await db.query.seasonPools.findFirst({
		columns: { guid: true },
		where: eq(seasonPools.guid, String(req.params.poolGuid)),
	});
	if (!pool) {
		res.status(404).json({ error: { code: "POOL_NOT_FOUND", message: "Map pool does not exist" } });
		return;
	}

	const beatSaverMap = await Beatsaver.getMapByKey(key, characteristic, difficulty);
	if (!beatSaverMap) {
		res.status(422).json({ error: { code: "INVALID_BEATSAVER_MAP", message: "BeatSaver versions[0] does not contain the requested characteristic and difficulty" } });
		return;
	}

	try {
		const [created] = await db
			.insert(maps)
			.values({
				poolGuid: pool.guid,
				categoryGuid: categoryGuid ?? null,
				name: beatSaverMap.songName,
				imageUrl: beatSaverMap.imageUrl,
				hash: beatSaverMap.hash.toUpperCase(),
				key: beatSaverMap.key,
				characteristic: beatSaverMap.characteristic,
				difficulty: beatSaverMap.difficulty as typeof maps.$inferInsert.difficulty,
				modifiers: modifiers as typeof maps.$inferInsert.modifiers,
				durationSeconds: Math.max(1, Math.ceil(beatSaverMap.length)),
				maxScore: beatSaverMap.maxScore,
			})
			.returning();
		res.status(201).json(created);
	} catch {
		res.status(409).json({ error: { code: "MAP_ALREADY_EXISTS", message: "This map already exists in the pool" } });
	}
});

/**
 * @openapi
 * /maps:
 *   get:
 *     tags: [Maps]
 *     summary: "List every map"
 *     description: "This endpoint is public."
 *     operationId: getMaps
 *     responses:
 *       200:
 *         description: The request completed successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               additionalProperties: true
 *       400:
 *         description: The request was invalid.
 *       401:
 *         description: Authentication is required when the endpoint is protected.
 *       403:
 *         description: The authenticated account does not have the required permission.
 *       404:
 *         description: The requested resource was not found.
 *       409:
 *         description: The request conflicts with the current resource state.
 */
router.get("/maps", async (_req, res) => {
	res.json(await db.query.maps.findMany({
		with: { pool: true, category: true },
	}));
});

/**
 * @openapi
 * /maps:
 *   post:
 *     tags: [Maps]
 *     summary: "Add a map"
 *     description: "This endpoint requires an authenticated administrator. The route is registered now and intentionally returns 404 Not Implemented until its service logic is added."
 *     operationId: postMaps
 *     security:
 *       - BeatKhanaAuth: []
 *     x-required-roles:
 *       - admin
 *     requestBody:
 *       required: false
 *       description: Request payload reserved for the endpoint implementation.
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             additionalProperties: true
 *     responses:
 *       404:
 *         description: The endpoint is registered but its implementation is not available yet.
 *         content:
 *           text/plain:
 *             schema:
 *               type: string
 *               example: Not Implemented
 */
router.post("/maps", (req, res) => {
	res.status(404).type("text/plain").send("Not Implemented");
});

/**
 * @openapi
 * /maps/{mapGuid}:
 *   get:
 *     tags: [Maps]
 *     summary: "Get a map by CompCube GUID"
 *     description: "This endpoint is public."
 *     operationId: getMapsByMapGuid
 *     parameters:
 *       - in: path
 *         name: mapGuid
 *         required: true
 *         description: "Identifies the mapGuid resource."
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: The request completed successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               additionalProperties: true
 *       400:
 *         description: The request was invalid.
 *       401:
 *         description: Authentication is required when the endpoint is protected.
 *       403:
 *         description: The authenticated account does not have the required permission.
 *       404:
 *         description: The requested resource was not found.
 *       409:
 *         description: The request conflicts with the current resource state.
 */
router.get("/maps/:mapGuid", async (req, res) => {
	const map = await db.query.maps.findFirst({
		where: eq(maps.guid, String(req.params.mapGuid)),
		with: { pool: true, category: true },
	});
	if (!map) {
		res.status(404).json({ error: { code: "MAP_NOT_FOUND", message: "Map does not exist" } });
		return;
	}
	res.json(map);
});

/**
 * @openapi
 * /maps/{mapGuid}:
 *   patch:
 *     tags: [Maps]
 *     summary: "Update map metadata and modifiers"
 *     description: "This endpoint requires an authenticated administrator."
 *     operationId: patchMapsByMapGuid
 *     security:
 *       - BeatKhanaAuth: []
 *     x-required-roles:
 *       - admin
 *     parameters:
 *       - in: path
 *         name: mapGuid
 *         required: true
 *         description: "Identifies the mapGuid resource."
 *         schema:
 *           type: string
 *     requestBody:
 *       required: false
 *       description: Request payload reserved for the endpoint implementation.
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             additionalProperties: true
 *     responses:
 *       200:
 *         description: The request completed successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               additionalProperties: true
 *       400:
 *         description: The request was invalid.
 *       401:
 *         description: Authentication is required when the endpoint is protected.
 *       403:
 *         description: The authenticated account does not have the required permission.
 *       404:
 *         description: The requested resource was not found.
 *       409:
 *         description: The request conflicts with the current resource state.
 */
router.patch("/maps/:mapGuid", requireAuth, async (req, res) => {
	if (!req.user?.permissions.some((permission) =>
		["role:pooler", "role:admin", "role:dev"].includes(permission)
	)) {
		res.status(403).json({ error: { code: "FORBIDDEN", message: "A map pooler is required" } });
		return;
	}
	const modifiers = req.body?.modifiers;
	if (modifiers !== undefined && (
		!Array.isArray(modifiers)
		|| ["SS", "FS", "SFS"].filter((modifier) => modifiers.includes(modifier)).length > 1
	)) {
		res.status(400).json({ error: { code: "INVALID_MODIFIERS", message: "Only one speed-changing modifier is allowed" } });
		return;
	}

	const [updated] = await db
		.update(maps)
		.set({
			...(req.body?.categoryGuid !== undefined ? { categoryGuid: req.body.categoryGuid } : {}),
			...(modifiers !== undefined ? { modifiers } : {}),
			updatedAt: new Date(),
		})
		.where(eq(maps.guid, String(req.params.mapGuid)))
		.returning();
	if (!updated) {
		res.status(404).json({ error: { code: "MAP_NOT_FOUND", message: "Map does not exist" } });
		return;
	}
	res.json(updated);
});

/**
 * @openapi
 * /maps/{mapGuid}:
 *   delete:
 *     tags: [Maps]
 *     summary: "Delete a map"
 *     description: "This endpoint requires an authenticated administrator."
 *     operationId: deleteMapsByMapGuid
 *     security:
 *       - BeatKhanaAuth: []
 *     x-required-roles:
 *       - admin
 *     parameters:
 *       - in: path
 *         name: mapGuid
 *         required: true
 *         description: "Identifies the mapGuid resource."
 *         schema:
 *           type: string
 *     responses:
 *       204:
 *         description: The resource was deleted.
 *       400:
 *         description: The request was invalid.
 *       401:
 *         description: Authentication is required when the endpoint is protected.
 *       403:
 *         description: The authenticated account does not have the required permission.
 *       404:
 *         description: The requested resource was not found.
 *       409:
 *         description: The request conflicts with the current resource state.
 */
router.delete("/maps/:mapGuid", requireAuth, async (req, res) => {
	if (!req.user?.permissions.some((permission) =>
		["role:pooler", "role:admin", "role:dev"].includes(permission)
	)) {
		res.status(403).json({ error: { code: "FORBIDDEN", message: "A map pooler is required" } });
		return;
	}
	const removed = await db.delete(maps).where(eq(maps.guid, String(req.params.mapGuid))).returning({ guid: maps.guid });
	if (!removed.length) {
		res.status(404).json({ error: { code: "MAP_NOT_FOUND", message: "Map does not exist" } });
		return;
	}
	res.status(204).send();
});

/**
 * @openapi
 * /maps/{hash}/{currentDifficulty}:
 *   put:
 *     tags: [Maps]
 *     summary: "Update a legacy map difficulty"
 *     description: "This endpoint requires an authenticated administrator. The route is registered now and intentionally returns 404 Not Implemented until its service logic is added."
 *     operationId: putMapsByHashByCurrentDifficulty
 *     security:
 *       - BeatKhanaAuth: []
 *     x-required-roles:
 *       - admin
 *     parameters:
 *       - in: path
 *         name: hash
 *         required: true
 *         description: "Identifies the hash resource."
 *         schema:
 *           type: string
 *       - in: path
 *         name: currentDifficulty
 *         required: true
 *         description: "Identifies the currentDifficulty resource."
 *         schema:
 *           type: string
 *     requestBody:
 *       required: false
 *       description: Request payload reserved for the endpoint implementation.
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             additionalProperties: true
 *     responses:
 *       404:
 *         description: The endpoint is registered but its implementation is not available yet.
 *         content:
 *           text/plain:
 *             schema:
 *               type: string
 *               example: Not Implemented
 */
router.put("/maps/:hash/:currentDifficulty", (req, res) => {
	res.status(404).type("text/plain").send("Not Implemented");
});

/**
 * @openapi
 * /maps/{hash}/{difficulty}:
 *   delete:
 *     tags: [Maps]
 *     summary: "Remove a legacy map difficulty"
 *     description: "This endpoint requires an authenticated administrator. The route is registered now and intentionally returns 404 Not Implemented until its service logic is added."
 *     operationId: deleteMapsByHashByDifficulty
 *     security:
 *       - BeatKhanaAuth: []
 *     x-required-roles:
 *       - admin
 *     parameters:
 *       - in: path
 *         name: hash
 *         required: true
 *         description: "Identifies the hash resource."
 *         schema:
 *           type: string
 *       - in: path
 *         name: difficulty
 *         required: true
 *         description: "Identifies the difficulty resource."
 *         schema:
 *           type: string
 *     responses:
 *       404:
 *         description: The endpoint is registered but its implementation is not available yet.
 *         content:
 *           text/plain:
 *             schema:
 *               type: string
 *               example: Not Implemented
 */
router.delete("/maps/:hash/:difficulty", (req, res) => {
	res.status(404).type("text/plain").send("Not Implemented");
});

export default router;
