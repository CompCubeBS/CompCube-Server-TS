import { ServiceError } from "../../../services/serviceError";
import { gameplayService } from "../../../services/gameplay.service";
import { emitResolvedRound } from "../../matchEvents";
import {
	acknowledged,
	type Ack,
	type AuthenticatedSocket,
} from "../common";
import {
	submitScoreEvent,
	type SubmitScoreInput,
	type SubmitScoreOutput,
} from "./submitScore.types";

/** Registers the "submitScore" request and validates every plugin-provided score value. */
export function registerSubmitScorePacket(socket: AuthenticatedSocket): void {
	socket.on(
		submitScoreEvent,
		(input: SubmitScoreInput, ack: Ack<SubmitScoreOutput>) =>
			void acknowledged(ack, async () => {
				const hasInvalidScore =
					!Number.isInteger(input?.rawScore) ||
					input.rawScore < 0 ||
					!Number.isInteger(input?.modifiedScore) ||
					input.modifiedScore < 0 ||
					!Number.isInteger(input.missCount) ||
					input.missCount < 0 ||
					(input.fullCombo && input.missCount !== 0);

				if (hasInvalidScore) {
					throw new ServiceError(
						"INVALID_SCORE",
						"Score values are inconsistent",
					);
				}

				const result = await gameplayService.submitScore(
					input.matchGuid,
					input.roundGuid,
					socket.data.user.guid,
					{
						rawScore: input.rawScore,
						modifiedScore: input.modifiedScore,
						noFailTriggered: input.noFailTriggered === true,
						proMode: input.proMode,
						missCount: input.missCount,
						fullCombo: input.fullCombo,
					},
				);
				if (result.resolved) {
					await emitResolvedRound(socket.nsp, result.resolved);
				}
				return {
					accepted: result.accepted,
					accuracy: result.accuracy,
					resolved: Boolean(result.resolved),
				};
			}),
	);
}
