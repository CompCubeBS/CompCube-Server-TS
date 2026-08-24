import type http from "node:http";
import { WebSocket, WebSocketServer } from "ws";
import { config } from "../config";
import { beatKhanaService } from "../services/beatkhana.service";

interface ReplayPeer extends WebSocket {
	canPublish: boolean;
	platformId: string;
}

/** Relays opaque protobuf replay frames from one authenticated plugin to public spectators. */
export function initialiseReplayRelay(server: http.Server): WebSocketServer {
	const replayServer = new WebSocketServer({ noServer: true, maxPayload: 256 * 1024 });
	const channels = new Map<string, Set<ReplayPeer>>();

	server.on("upgrade", (request, socket, head) => {
		const requestUrl = new URL(request.url ?? "/", "http://replay.local");
		const match = requestUrl.pathname.match(/^\/live\/u\/([0-9]+)$/);
		if (!match) return;

		const platformId = match[1];
		let canPublish = false;
		const authorization = request.headers.authorization;
		if (authorization?.startsWith("Bearer ")) {
			try {
				const claims = beatKhanaService.verifyAccessToken(authorization.slice("Bearer ".length));
				canPublish = claims.tokenType === "beatkhana:game" && claims.platformId === platformId;
				const pluginVersion = request.headers["x-compcube-plugin-version"];
				if (config.pluginVersions.length && (
					typeof pluginVersion !== "string" || !config.pluginVersions.includes(pluginVersion)
				)) canPublish = false;
			} catch {
				canPublish = false;
			}
		}

		replayServer.handleUpgrade(request, socket, head, (rawPeer) => {
			const peer = rawPeer as ReplayPeer;
			peer.canPublish = canPublish;
			peer.platformId = platformId;
			replayServer.emit("connection", peer, request);
		});
	});

	replayServer.on("connection", (peer: ReplayPeer) => {
		const channel = channels.get(peer.platformId) ?? new Set<ReplayPeer>();
		channel.add(peer);
		channels.set(peer.platformId, channel);

		peer.on("message", (data, isBinary) => {
			if (!peer.canPublish || !isBinary) return;
			for (const spectator of channel) {
				if (spectator !== peer && spectator.readyState === WebSocket.OPEN) {
					spectator.send(data, { binary: true });
				}
			}
		});
		peer.on("close", () => {
			channel.delete(peer);
			if (!channel.size) channels.delete(peer.platformId);
		});
	});

	return replayServer;
}
