import type { PacketMap } from "../common";

export const startMapEvent = "startMap" as const;
export const startMapOutput = {
	matchGuid: "uuid",
	roundGuid: "uuid",
	map: "PacketMap",
	scoreDueAt: "date-time",
} as const;

export interface StartMapOutput {
	matchGuid: string;
	roundGuid: string;
	map: PacketMap;
	scoreDueAt: string;
}
