import { and, eq } from "drizzle-orm";
import type { Server } from "socket.io";
import { db } from "../../db/db";
import { matchHands, matchParticipants, matches } from "../../db/schema";
import { config } from "../config";
import { accountService } from "../services/account.service";
import { beatKhanaService } from "../services/beatkhana.service";
import { queueService } from "../services/queue.service";
import { gameplayService } from "../services/gameplay.service";
import { timerService } from "../services/timer.service";
import { emitResolvedRound } from "./matchEvents";
import type { AuthenticatedSocket } from "./packets/common";
import { registerAdminDecisionPacket } from "./packets/adminDecision/adminDecision.packetHandler";
import { forfeitDisconnectedPlayer, registerClientDisconnectPacket } from "./packets/clientDisconnect/clientDisconnect.packetHandler";
import { registerDiscardMapsPacket } from "./packets/discardMaps/discardMaps.packetHandler";
import { registerGetMatchStatePacket } from "./packets/getMatchState/getMatchState.packetHandler";
import { registerForfeitPacket } from "./packets/forfeit/forfeit.packetHandler";
import { registerHelloPacket } from "./packets/hello/hello.packetHandler";
import { registerJoinQueuePacket } from "./packets/joinQueue/joinQueue.packetHandler";
import { registerLeaveQueuePacket } from "./packets/leaveQueue/leaveQueue.packetHandler";
import { registerPauseMatchPacket } from "./packets/pauseMatch/pauseMatch.packetHandler";
import { registerResumeMatchPacket } from "./packets/resumeMatch/resumeMatch.packetHandler";
import { registerSelectMapPacket } from "./packets/selectMap/selectMap.packetHandler";
import { registerSkipTimerPacket } from "./packets/skipTimer/skipTimer.packetHandler";
import { registerSubmitScorePacket } from "./packets/submitScore/submitScore.packetHandler";
import { registerWatchMatchPacket } from "./packets/watchMatch/watchMatch.packetHandler";
import type { PublicSocket } from "./packets/common";

/** Authenticates Socket.IO clients and registers every client-to-server packet event. */
export function initialiseSocketManager(io: Server): void {
	timerService.register("custom", async () => {
		// Custom timers only persist an administrative deadline. Reaching it completes the timer without changing a match.
	});
	timerService.register("score_submission", async (timer) => {
		const roundGuid = typeof timer.payload.roundGuid === "string"
			? timer.payload.roundGuid
			: null;
		if (!roundGuid) {
			throw new Error("Score submission timer is missing roundGuid");
		}
		const result = await gameplayService.expireScoreDeadline(roundGuid);
		if (result) await emitResolvedRound(io, result);
	});
	timerService.register("discard", async (timer) => {
		const match = await db.query.matches.findFirst({ where: eq(matches.guid, timer.matchGuid) });
		if (!match || match.status !== "awaiting_discards") return;
		const hands = await db.query.matchHands.findMany({
			where: eq(matchHands.matchGuid, timer.matchGuid),
		});
		let readyResult: Awaited<ReturnType<typeof gameplayService.discardMaps>> | null = null;
		for (const hand of hands.filter((candidate) => !candidate.discardedAt)) {
			readyResult = await gameplayService.discardMaps(timer.matchGuid, hand.userGuid, []);
		}
		if (readyResult?.ready) {
			const pick = await gameplayService.getPickState(timer.matchGuid);
			io.to(`match:${timer.matchGuid}`).emit("pickPhaseStarted", {
				matchGuid: timer.matchGuid,
				roundNumber: pick.roundNumber,
				isOwnPick: false,
				availableMaps: [],
				damageMultiplier: pick.damageMultiplier,
				timerDueAt: readyResult.pickDueAt?.toISOString() ?? null,
			});
			io.to(`user:${pick.picker.userGuid}`).emit("pickPhaseStarted", {
				matchGuid: timer.matchGuid,
				roundNumber: pick.roundNumber,
				isOwnPick: true,
				availableMaps: pick.cards.map((map) => ({
					guid: map.guid,
					hash: map.hash,
					characteristic: map.characteristic,
					difficulty: map.difficulty,
					modifiers: map.modifiers,
					durationSeconds: map.durationSeconds,
					maxScore: map.maxScore,
				})),
				damageMultiplier: pick.damageMultiplier,
				timerDueAt: readyResult.pickDueAt?.toISOString() ?? null,
			});
		}
	});
	timerService.register("pick", async (timer) => {
		const match = await db.query.matches.findFirst({ where: eq(matches.guid, timer.matchGuid) });
		if (!match || match.status !== "awaiting_pick") return;
		const pick = await gameplayService.getPickState(timer.matchGuid);
		const firstMap = pick.cards[0];
		if (!firstMap) throw new Error("Pick timer expired without an available map");
		const result = await gameplayService.selectMap(timer.matchGuid, pick.picker.userGuid, firstMap.guid);
		const map = {
			guid: result.map.guid,
			hash: result.map.hash,
			characteristic: result.map.characteristic,
			difficulty: result.map.difficulty,
			modifiers: result.map.modifiers,
			durationSeconds: result.map.durationSeconds,
			maxScore: result.map.maxScore,
		};
		io.to(`match:${timer.matchGuid}`).emit("playerSelectedMap", {
			matchGuid: timer.matchGuid,
			roundNumber: result.round.roundNumber,
			pickerUserGuid: pick.picker.userGuid,
			map,
			automatic: true,
		});
		io.to(`match:${timer.matchGuid}`).emit("startMap", {
			matchGuid: timer.matchGuid,
			roundGuid: result.round.guid,
			map,
			scoreDueAt: result.dueAt.toISOString(),
		});
	});

	io.use(async (socket, next) => {
		try {
			const clientType = socket.handshake.auth?.clientType;
			socket.data.clientType = clientType === "plugin" || clientType === "mock" || clientType === "website"
				? clientType
				: "website";
			const pluginVersion = typeof socket.handshake.auth?.pluginVersion === "string"
				? socket.handshake.auth.pluginVersion.trim()
				: "";
			socket.data.pluginVersion = pluginVersion || undefined;
			const accessToken =
				typeof socket.handshake.auth?.accessToken === "string"
					? socket.handshake.auth.accessToken
					: null;
			if (accessToken) {
				const claims = beatKhanaService.verifyAccessToken(accessToken);
				if (socket.data.clientType === "plugin") {
					if (claims.tokenType !== "beatkhana:game" || !claims.platformId) {
						throw new Error("PLUGIN_GAME_TOKEN_REQUIRED");
					}
					if (!pluginVersion) throw new Error("PLUGIN_VERSION_REQUIRED");
					if (config.pluginVersions.length && !config.pluginVersions.includes(pluginVersion)) {
						throw new Error("PLUGIN_VERSION_UNSUPPORTED");
					}
				}
				socket.data.user = (
					await accountService.upsertFromBeatKhanaToken(
						claims,
						config.beatKhana.linkingUrl,
					)
				).user;
				next();
				return;
			}

			// Public spectators can connect without an account. Only public packet handlers are registered for them below.
			next();
		} catch {
			next(new Error("AUTH_FAILED"));
		}
	});

	io.on("connection", (rawSocket) => {
		const socket = rawSocket as PublicSocket;
		registerHelloPacket(socket); // Client -> server: "hello" (public)
		registerGetMatchStatePacket(socket); // Client -> server: "getMatchState" (public)
		registerWatchMatchPacket(socket); // Client -> server: "watchMatch" (public)

		if (!socket.data.user) return;
		const authenticatedSocket = socket as AuthenticatedSocket;
		void (async () => {
			await authenticatedSocket.join(`user:${authenticatedSocket.data.user.guid}`);
			const activeMatches = await db.query.matchParticipants.findMany({
				columns: { matchGuid: true },
				where: and(
					eq(matchParticipants.userGuid, authenticatedSocket.data.user.guid),
					eq(matchParticipants.active, true),
				),
			});
			for (const match of activeMatches) {
				await authenticatedSocket.join(`match:${match.matchGuid}`);
			}
		})().catch((error) => {
			console.error("[WebSocket]: Could not restore match rooms", error);
		});
		registerJoinQueuePacket(authenticatedSocket); // Client -> server: "joinQueue"
		registerLeaveQueuePacket(authenticatedSocket); // Client -> server: "leaveQueue"
		registerClientDisconnectPacket(authenticatedSocket); // Client -> server: "clientDisconnect"
		registerForfeitPacket(authenticatedSocket); // Client -> server: "forfeit"
		registerDiscardMapsPacket(authenticatedSocket); // Client -> server: "discardMaps"
		registerSkipTimerPacket(authenticatedSocket); // Client -> server: "skipTimer"
		registerSelectMapPacket(authenticatedSocket); // Client -> server: "selectMap"
		registerSubmitScorePacket(authenticatedSocket); // Client -> server: "submitScore"
		registerPauseMatchPacket(authenticatedSocket); // Client -> server: "pauseMatch"
		registerResumeMatchPacket(authenticatedSocket); // Client -> server: "resumeMatch"
		registerAdminDecisionPacket(authenticatedSocket); // Client -> server: "adminDecision"

		// Future server -> client packet registers:
		// matchCreated, cardsUpdated, pickPhaseStarted, playerSelectedMap,
		// roundStarted, roundResults, timerUpdated, matchPaused, matchResumed,
		// matchFinished, opponentDisconnected and serverError.
		authenticatedSocket.on("disconnect", () => {
			void (async () => {
				await queueService.leave(authenticatedSocket.data.user.guid);
				if (authenticatedSocket.data.clientType === "plugin") {
					await forfeitDisconnectedPlayer(authenticatedSocket);
				}
			})().catch((error) => {
				console.error("[WebSocket]: Could not handle disconnected user", error);
			});
		});
	});
}
