import { SlashCommandBuilder } from "discord.js";
import type { DiscordSlashCommand } from "./command.types";
export const votesCommand: DiscordSlashCommand = {
	data: new SlashCommandBuilder()
		.setName("votes")
		.setDescription("List the votes on a map submission thread."),
	async execute(interaction) {
		await interaction.reply({
			content: "Map thread vote counting is registered, but the submission persistence is not implemented yet.",
			ephemeral: true,
		});
	},
};
