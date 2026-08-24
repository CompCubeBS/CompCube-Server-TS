import {
	ActionRowBuilder,
	ModalBuilder,
	TextInputBuilder,
	TextInputStyle,
	type Interaction,
} from "discord.js";

/** Handles the map-submission button and modal interactions owned by the Discord bot. */
export async function handleMapSubmissionInteraction(
	interaction: Interaction,
): Promise<boolean> {
	if (
		interaction.isButton() &&
		interaction.customId === "submitMapFromBeatSaverButton"
	) {
		const map = new TextInputBuilder()
			.setCustomId("map")
			.setLabel("BeatSaver key or URL")
			.setStyle(TextInputStyle.Short)
			.setRequired(true);
		const difficulty = new TextInputBuilder()
			.setCustomId("difficulty")
			.setLabel("Difficulty")
			.setStyle(TextInputStyle.Short)
			.setRequired(true);
		const category = new TextInputBuilder()
			.setCustomId("category")
			.setLabel("Category")
			.setStyle(TextInputStyle.Short)
			.setRequired(true);
		await interaction.showModal(
			new ModalBuilder()
				.setCustomId("submitMapFromBeatSaverModal")
				.setTitle("Submit from BeatSaver")
				.addComponents(
					new ActionRowBuilder<TextInputBuilder>().addComponents(map),
					new ActionRowBuilder<TextInputBuilder>().addComponents(
						difficulty,
					),
					new ActionRowBuilder<TextInputBuilder>().addComponents(
						category,
					),
				),
		);
		return true;
	}
	if (
		interaction.isModalSubmit() &&
		interaction.customId === "submitMapFromBeatSaverModal"
	) {
		// This keeps the old C# interaction wired while the proper submission table is being designed.
		await interaction.reply({
			content: `Received ${interaction.fields.getTextInputValue("map")}. The moderation queue write is not implemented yet.`,
			ephemeral: true,
		});
		return true;
	}
	return false;
}
