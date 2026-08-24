import {
	Client,
	Collection,
	Events,
	GatewayIntentBits,
	REST,
	Routes,
} from "discord.js";
import { config } from "../config";
import { createMapSubmissionMessageCommand } from "./commands/createMapSubmissionMessage.command";
import { getQueueCommand } from "./commands/getqueue.command";
import { mapsCommand } from "./commands/maps.command";
import type { DiscordSlashCommand } from "./commands/command.types";
import { votesCommand } from "./commands/votes.command";
import { handleMapSubmissionInteraction } from "./interactions/mapSubmission.interaction";

const commands = [
	mapsCommand,
	getQueueCommand,
	votesCommand,
	createMapSubmissionMessageCommand,
];

class DiscordBot {
	private client?: Client;

	/** Registers slash commands and starts the Discord interaction client when configured. */
	async start(): Promise<void> {
		if (!config.discordToken || !config.discordClientId) {
			console.info(
				"[Discord Bot]: Disabled; DISCORD_TOKEN or DISCORD_CLIENT_ID is missing.",
			);
			return;
		}
		const byName = new Collection<string, DiscordSlashCommand>(
			commands.map((command) => [command.data.name, command]),
		);
		const rest = new REST().setToken(config.discordToken);
		const body = commands.map((command) => command.data.toJSON());
		const route = config.discordGuildId
			? Routes.applicationGuildCommands(
					config.discordClientId,
					config.discordGuildId,
				)
			: Routes.applicationCommands(config.discordClientId);
		await rest.put(route, { body });

		this.client = new Client({ intents: [GatewayIntentBits.Guilds] });
		this.client.on(Events.InteractionCreate, async (interaction) => {
			try {
				if (await handleMapSubmissionInteraction(interaction)) return;
				if (!interaction.isChatInputCommand()) return;
				const command = byName.get(interaction.commandName);
				if (command) await command.execute(interaction);
			} catch (error) {
				console.error("[Discord Bot]: Interaction failed", error);
				if (interaction.isRepliable()) {
					const response = {
						content: "The command could not be completed.",
						ephemeral: true,
					} as const;
					if (interaction.replied || interaction.deferred) {
						await interaction.followUp(response);
					} else {
						await interaction.reply(response);
					}
				}
			}
		});
		await this.client.login(config.discordToken);
	}
	/** Stops the Discord client without affecting the HTTP or WebSocket servers. */
	async stop(): Promise<void> {
		this.client?.destroy();
	}
}

export const discordBot = new DiscordBot();
