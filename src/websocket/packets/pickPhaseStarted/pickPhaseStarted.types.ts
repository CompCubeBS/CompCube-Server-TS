import type { PacketMap } from "../common";
export const pickPhaseStartedEvent = "pickPhaseStarted" as const;
export const pickPhaseStartedOutput = {
	matchGuid: "uuid",
	roundNumber: "integer",
	isOwnPick: "boolean",
	availableMaps: "PacketMap[]",
	damageMultiplier: "number",
	timerDueAt: "date-time|null",
} as const;
export interface PickPhaseStartedOutput {
	matchGuid: string;
	roundNumber: number;
	isOwnPick: boolean;
	availableMaps: PacketMap[];
	damageMultiplier: number;
	timerDueAt: string | null;
}
