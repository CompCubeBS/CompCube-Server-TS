import type { PacketMap, PacketUser } from "../common";
export const matchCreatedEvent = "matchCreated" as const;
export const matchCreatedOutput = {
	matchGuid: "uuid",
	red: "PacketUser",
	blue: "PacketUser",
	initialMaps: "PacketMap[]",
	timerDueAt: "date-time|null",
} as const;
export interface MatchCreatedOutput {
	matchGuid: string;
	red: PacketUser;
	blue: PacketUser;
	initialMaps: PacketMap[];
	timerDueAt: string | null;
}
