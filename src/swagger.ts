import path from "node:path";
import swaggerJsdoc from "swagger-jsdoc";
import { config } from "./config";

export const swaggerSpec = swaggerJsdoc({
	definition: {
		openapi: "3.0.3",
		info: {
			title: "CompCube API",
			version: "1.0.0",
			description:
				"CompCube accounts, matchmaking, map pools and persisted match-state API. "
				+ "Paths are served directly from api.compcube.net without an /api prefix.",
		},
		servers: [{ url: config.publicApiUrl, description: config.nodeEnv }],
		tags: [
			{ name: "System", description: "Health checks and game-server status" },
			{ name: "Authentication", description: "BeatKhana OAuth and account linking" },
			{ name: "Accounts", description: "The authenticated CompCube account" },
			{ name: "Users", description: "Public profiles and user administration" },
			{ name: "Contributors", description: "Project contributor information" },
			{ name: "Seasons", description: "Non-overlapping competitive seasons" },
			{ name: "Competitive Statistics", description: "Season MMR, wins and streak history" },
			{ name: "Leaderboards", description: "Global and seasonal rankings" },
			{ name: "Pools", description: "Season map pools" },
			{ name: "Map Pooling", description: "Legacy map-review queue and batch operations" },
			{ name: "Maps", description: "Beat Saber maps, difficulties and modifiers" },
			{ name: "Flairs", description: "Map categories and presentation metadata" },
			{ name: "Queues", description: "Player matchmaking queues" },
			{ name: "Mock Clients", description: "Private developer-controlled match clients" },
			{ name: "Matches", description: "Persisted matches, participants, hands and state history" },
			{ name: "Timers", description: "Durable match timers" },
			{ name: "Rounds", description: "Selected maps and played match rounds" },
			{ name: "Scores", description: "Player score submissions and accuracy" },
			{ name: "Moderation", description: "Moderator and administrator match decisions" },
			{ name: "Internal", description: "Development-only template endpoints" },
		],
		components: {
			securitySchemes: {
				BeatKhanaAuth: {
					type: "http",
					scheme: "bearer",
					bearerFormat: "BeatKhana access token",
				},
				PoolSecret: {
					type: "apiKey",
					in: "query",
					name: "secret",
					description: "Legacy map-pooling secret.",
				},
			},
			responses: {
				NotImplemented: {
					description: "The route is reserved but has not been implemented yet.",
					content: {
						"text/plain": {
							schema: {
								type: "string",
								example: "Not Implemented",
							},
						},
					},
				},
			},
			schemas: {
				ApiError: {
					type: "object",
					required: ["error"],
					properties: {
						error: {
							type: "object",
							required: ["code", "message"],
							properties: {
								code: { type: "string" },
								message: { type: "string" },
							},
						},
					},
				},
				User: {
					type: "object",
					required: ["guid", "username", "permissions", "banned"],
					properties: {
						guid: { type: "string", format: "uuid" },
						beatKhanaGuid: { type: "string", format: "uuid", nullable: true },
						discordId: { type: "string", nullable: true },
						platformId: { type: "string", nullable: true },
						username: { type: "string" },
						avatarUrl: { type: "string", format: "uri", nullable: true },
						permissions: { type: "array", items: { type: "string" } },
						banned: { type: "boolean" },
					},
				},
			},
		},
	},
	apis: [
		path.join(__dirname, "routes/**/*.{ts,js}"),
		path.join(__dirname, "index.{ts,js}"),
	],
});
