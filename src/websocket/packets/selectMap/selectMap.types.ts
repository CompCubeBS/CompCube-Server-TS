export const selectMapEvent = "selectMap" as const;
export const selectMapInput = { matchGuid: "uuid", mapGuid: "uuid" } as const;
export const selectMapOutput = { roundGuid: "uuid", mapGuid: "uuid", scoreDueAt: "date-time" } as const;
export interface SelectMapInput {
	matchGuid: string;
	mapGuid: string;
}
export interface SelectMapOutput {
	roundGuid: string;
	mapGuid: string;
	scoreDueAt: string;
}
