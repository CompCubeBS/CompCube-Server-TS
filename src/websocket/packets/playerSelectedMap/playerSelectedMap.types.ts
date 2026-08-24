import type { PacketMap } from "../common";
export const playerSelectedMapEvent = "playerSelectedMap" as const;
export const playerSelectedMapOutput = {
	matchGuid: "uuid",
	roundNumber: "integer",
	pickerUserGuid: "uuid",
	map: "PacketMap",
} as const;
export interface PlayerSelectedMapOutput {
	matchGuid: string;
	roundNumber: number;
	pickerUserGuid: string;
	map: PacketMap;
}
