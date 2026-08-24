export const discardMapsEvent = "discardMaps" as const;
export const discardMapsInput = {
	matchGuid: "uuid",
	mapGuids: "uuid[0..2]",
} as const;
export const discardMapsOutput = { acceptedMapGuids: "uuid[]" } as const;
export interface DiscardMapsInput {
	matchGuid: string;
	mapGuids: string[];
}

export interface DiscardMapsOutput {
	acceptedMapGuids: string[];
}
