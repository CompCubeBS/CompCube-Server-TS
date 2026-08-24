import type {
	ChatInputCommandInteraction,
	SlashCommandBuilder,
} from "discord.js";
export interface DiscordSlashCommand {
	data: SlashCommandBuilder;
	execute(interaction: ChatInputCommandInteraction): Promise<void>;
}
