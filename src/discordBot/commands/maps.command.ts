import { asc } from "drizzle-orm";
import { EmbedBuilder, SlashCommandBuilder } from "discord.js";
import { db } from "../../../db/db";
import { maps } from "../../../db/schema";
import type { DiscordSlashCommand } from "./command.types";

export const mapsCommand: DiscordSlashCommand = {
	data: new SlashCommandBuilder()
		.setName("maps")
		.setDescription("Shows all active and playable maps."),
	async execute(interaction) {
		const activeMaps = await db.query.maps.findMany({
			orderBy: asc(maps.name),
			limit: 50,
		});
		const description = activeMaps.length
			? activeMaps
					.map(
						(map) => `${map.name} - ${map.difficulty} (${map.key})`,
					)
					.join("\n")
			: "No maps!";
		await interaction.reply({
			embeds: [
				new EmbedBuilder()
					.setTitle("Active Maps")
					.setDescription(description.slice(0, 4096)),
			],
			ephemeral: true,
		});
	},
};
