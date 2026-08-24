import { adminDecisionInput, adminDecisionOutput } from "./packets/adminDecision/adminDecision.types";
import { cardsUpdatedOutput } from "./packets/cardsUpdated/cardsUpdated.types";
import { clientDisconnectInput, clientDisconnectOutput } from "./packets/clientDisconnect/clientDisconnect.types";
import { discardMapsInput, discardMapsOutput } from "./packets/discardMaps/discardMaps.types";
import { getMatchStateInput, getMatchStateOutput } from "./packets/getMatchState/getMatchState.types";
import { helloInput, helloOutput } from "./packets/hello/hello.types";
import { joinQueueInput, joinQueueOutput } from "./packets/joinQueue/joinQueue.types";
import { forfeitInput, forfeitOutput } from "./packets/forfeit/forfeit.types";
import { leaveQueueInput, leaveQueueOutput } from "./packets/leaveQueue/leaveQueue.types";
import { matchCreatedOutput } from "./packets/matchCreated/matchCreated.types";
import { matchFinishedOutput } from "./packets/matchFinished/matchFinished.types";
import { matchPausedOutput } from "./packets/matchPaused/matchPaused.types";
import { matchResumedOutput } from "./packets/matchResumed/matchResumed.types";
import { opponentDisconnectedOutput } from "./packets/opponentDisconnected/opponentDisconnected.types";
import { pauseMatchInput, pauseMatchOutput } from "./packets/pauseMatch/pauseMatch.types";
import { pickPhaseStartedOutput } from "./packets/pickPhaseStarted/pickPhaseStarted.types";
import { playerSelectedMapOutput } from "./packets/playerSelectedMap/playerSelectedMap.types";
import { resumeMatchInput, resumeMatchOutput } from "./packets/resumeMatch/resumeMatch.types";
import { roundResultsOutput } from "./packets/roundResults/roundResults.types";
import { roundStartedOutput } from "./packets/roundStarted/roundStarted.types";
import { selectMapInput, selectMapOutput } from "./packets/selectMap/selectMap.types";
import { serverErrorOutput } from "./packets/serverError/serverError.types";
import { skipTimerInput, skipTimerOutput } from "./packets/skipTimer/skipTimer.types";
import { startMapOutput } from "./packets/startMap/startMap.types";
import { submitScoreInput, submitScoreOutput } from "./packets/submitScore/submitScore.types";
import { timerUpdatedOutput } from "./packets/timerUpdated/timerUpdated.types";
import { watchMatchInput, watchMatchOutput } from "./packets/watchMatch/watchMatch.types";

const acknowledgement = {
	oneOf: [
		{ type: "object", properties: { ok: { const: true }, data: { type: "object" } } },
		{
			type: "object",
			properties: {
				ok: { const: false },
				error: {
					type: "object",
					properties: { code: { type: "string" }, message: { type: "string" } },
				},
			},
		},
	],
} as const;

/** AsyncAPI-style Socket.IO documentation generated from the packet-owned type descriptors. */
export const socketDocumentation = {
	asyncapi: "3.0.0",
	info: {
		title: "CompCube Socket.IO API",
		version: "1.0.0",
		description: "Raw JSON Socket.IO events. Every client request must provide an acknowledgement callback.",
	},
	defaultContentType: "application/json",
	components: { schemas: { Acknowledgement: acknowledgement } },
	channels: {
		hello: { address: "hello", direction: "client-to-server", input: helloInput, acknowledgement: helloOutput },
		joinQueue: { address: "joinQueue", direction: "client-to-server", input: joinQueueInput, acknowledgement: joinQueueOutput },
		forfeit: { address: "forfeit", direction: "client-to-server", input: forfeitInput, acknowledgement: forfeitOutput },
		leaveQueue: { address: "leaveQueue", direction: "client-to-server", input: leaveQueueInput, acknowledgement: leaveQueueOutput },
		clientDisconnect: { address: "clientDisconnect", direction: "client-to-server", input: clientDisconnectInput, acknowledgement: clientDisconnectOutput },
		discardMaps: { address: "discardMaps", direction: "client-to-server", input: discardMapsInput, acknowledgement: discardMapsOutput },
		skipTimer: { address: "skipTimer", direction: "client-to-server", input: skipTimerInput, acknowledgement: skipTimerOutput },
		selectMap: { address: "selectMap", direction: "client-to-server", input: selectMapInput, acknowledgement: selectMapOutput },
		submitScore: { address: "submitScore", direction: "client-to-server", input: submitScoreInput, acknowledgement: submitScoreOutput },
		getMatchState: { address: "getMatchState", direction: "client-to-server", input: getMatchStateInput, acknowledgement: getMatchStateOutput },
		watchMatch: { address: "watchMatch", direction: "client-to-server", input: watchMatchInput, acknowledgement: watchMatchOutput },
		pauseMatch: { address: "pauseMatch", direction: "client-to-server", input: pauseMatchInput, acknowledgement: pauseMatchOutput },
		resumeMatch: { address: "resumeMatch", direction: "client-to-server", input: resumeMatchInput, acknowledgement: resumeMatchOutput },
		adminDecision: { address: "adminDecision", direction: "client-to-server", input: adminDecisionInput, acknowledgement: adminDecisionOutput },
		matchCreated: { address: "matchCreated", direction: "server-to-client", output: matchCreatedOutput },
		cardsUpdated: { address: "cardsUpdated", direction: "server-to-client", output: cardsUpdatedOutput },
		pickPhaseStarted: { address: "pickPhaseStarted", direction: "server-to-client", output: pickPhaseStartedOutput },
		playerSelectedMap: { address: "playerSelectedMap", direction: "server-to-client", output: playerSelectedMapOutput },
		roundStarted: { address: "roundStarted", direction: "server-to-client", output: roundStartedOutput },
		startMap: { address: "startMap", direction: "server-to-client", output: startMapOutput },
		roundResults: { address: "roundResults", direction: "server-to-client", output: roundResultsOutput },
		timerUpdated: { address: "timerUpdated", direction: "server-to-client", output: timerUpdatedOutput },
		matchPaused: { address: "matchPaused", direction: "server-to-client", output: matchPausedOutput },
		matchResumed: { address: "matchResumed", direction: "server-to-client", output: matchResumedOutput },
		matchFinished: { address: "matchFinished", direction: "server-to-client", output: matchFinishedOutput },
		opponentDisconnected: { address: "opponentDisconnected", direction: "server-to-client", output: opponentDisconnectedOutput },
		serverError: { address: "serverError", direction: "server-to-client", output: serverErrorOutput },
		replayStream: {
			address: "/live/u/{platformId}",
			direction: "plugin-to-spectators",
			contentType: "application/protobuf",
			protocol: "raw-websocket",
			publisherAuth: "Authorization: Bearer <BeatKhana game token>",
			publisherVersionHeader: "X-CompCube-Plugin-Version",
			spectatorAuth: false,
			message: "scoresaber.live.v1.ReplayStreamPacket",
			maxFrameBytes: 262144,
		},
	},
} as const;
