import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	EmbedBuilder,
	PermissionFlagsBits,
	SlashCommandBuilder,
} from "discord.js";
import type { DiscordSlashCommand } from "./command.types";
export const createMapSubmissionMessageCommand: DiscordSlashCommand = {
	data: new SlashCommandBuilder()
		.setName("createmapsubmissionmessage")
		.setDescription("Create a new map submission message.")
		.setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
	async execute(interaction) {
		const button = new ButtonBuilder()
			.setCustomId("submitMapFromBeatSaverButton")
			.setLabel("Submit from BeatSaver")
			.setStyle(ButtonStyle.Primary);
		await interaction.reply({
			embeds: [
				new EmbedBuilder()
					.setTitle("Pool Submission")
					.setDescription(
						"Submit a BeatSaver map for the next pool.",
					),
			],
			components: [
				new ActionRowBuilder<ButtonBuilder>().addComponents(button),
			],
		});
	},
};
