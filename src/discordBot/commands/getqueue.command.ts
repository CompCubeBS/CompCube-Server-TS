import { SlashCommandBuilder } from "discord.js";
import type { DiscordSlashCommand } from "./command.types";
export const getQueueCommand: DiscordSlashCommand = {
	data: new SlashCommandBuilder()
		.setName("getqueue")
		.setDescription("Shows all maps currently in the pooling queue."),
	async execute(interaction) {
		await interaction.reply({
			content: "The map submission queue is registered, but its moderation workflow is not implemented yet.",
			ephemeral: true,
		});
	},
};
