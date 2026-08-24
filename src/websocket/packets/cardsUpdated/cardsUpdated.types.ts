import type { PacketMap } from "../common";
export const cardsUpdatedEvent = "cardsUpdated" as const;
export const cardsUpdatedOutput = {
	matchGuid: "uuid",
	maps: "PacketMap[]",
} as const;
export interface CardsUpdatedOutput {
	matchGuid: string;
	maps: PacketMap[];
}
