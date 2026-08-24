import "dotenv/config";
import cors from "cors";
import express from "express";
import http from "node:http";
import { Server } from "socket.io";
import swaggerUi from "swagger-ui-express";
import { closeDatabase } from "../db/db";
import { config } from "./config";
import { discordBot } from "./discordBot/discordBot";
import accountRouter from "./routes/account.route";
import authRouter from "./routes/auth.route";
import accountsRouter from "./routes/accounts.route";
import competitiveStatisticsRouter from "./routes/competitiveStatistics.route";
import contributorsRouter from "./routes/contributors.route";
import flairsRouter from "./routes/flairs.route";
import leaderboardsRouter from "./routes/leaderboards.route";
import mapPoolingRouter from "./routes/mapPooling.route";
import mapsRouter from "./routes/maps.route";
import matchesRouter from "./routes/matches.route";
import mockClientsRouter from "./routes/mockClients.route";
import moderationRouter from "./routes/moderation.route";
import poolsRouter from "./routes/pools.route";
import queuesRouter from "./routes/queues.route";
import roundsRouter from "./routes/rounds.route";
import scoresRouter from "./routes/scores.route";
import seasonsRouter from "./routes/seasons.route";
import timersRouter from "./routes/timers.route";
import usersRouter from "./routes/users.route";
import systemRouter from "./routes/system.route";
import templateRouter from "./routes/template-ts.route";
import { timerService } from "./services/timer.service";
import { beatKhanaService } from "./services/beatkhana.service";
import { startupService } from "./services/startup.service";
import { swaggerSpec } from "./swagger";
import { initialiseSocketManager } from "./websocket/wsManager";
import { socketDocumentation } from "./websocket/socketDocumentation";
import { socketDocumentationPage } from "./websocket/socketDocumentationPage";
import { initialiseReplayRelay } from "./websocket/replayRelay";

const app = express();
app.disable("x-powered-by");
app.set(
	"trust proxy",
	process.env.TRUST_PROXY ?? "loopback, linklocal, uniquelocal",
);
app.use(
	cors({
		// When every origin is allowed, cors reflects the request origin instead of sending `*`.
		// This lets the website include its OAuth cookies while keeping the response valid in browsers.
		origin: config.corsOrigin === "*" ? true : config.corsOrigin,
		credentials: true,
	}),
);
app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: false }));

app.use("/oauth", authRouter);
app.use("/account", accountRouter);
app.use("/", systemRouter);
app.use("/", templateRouter);
app.use(accountsRouter);
app.use(competitiveStatisticsRouter);
app.use(contributorsRouter);
app.use(flairsRouter);
app.use(leaderboardsRouter);
app.use(mapPoolingRouter);
app.use(mapsRouter);
app.use(matchesRouter);
app.use(mockClientsRouter);
app.use(moderationRouter);
app.use(poolsRouter);
app.use(queuesRouter);
app.use(roundsRouter);
app.use(scoresRouter);
app.use(seasonsRouter);
app.use(timersRouter);
app.use(usersRouter);
app.get("/docs/ws", (_req, res) =>
	res.type("html").send(socketDocumentationPage()),
);
app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.get("/openapi.json", (req, res) => res.json(swaggerSpec));
app.get("/socket-docs.json", (_req, res) => res.json(socketDocumentation));
app.use((req, res) =>
	res.status(404).json({
		error: { code: "NOT_FOUND", message: "Route does not exist" },
	}),
);

const socketHttpServer = http.createServer();
const io = new Server(socketHttpServer, {
	cors: {
		origin: config.corsOrigin === "*" ? true : config.corsOrigin,
		methods: ["GET", "POST"],
		credentials: true,
	},
	transports: ["websocket", "polling"],
});
initialiseSocketManager(io);
const replayServer = initialiseReplayRelay(socketHttpServer);
let restServer: http.Server | null = null;

async function start(): Promise<void> {
	await beatKhanaService.initialize();
	await startupService.ensureRequiredAccounts();
	restServer = app.listen(config.restPort, () =>
		console.log(`[REST API]: ${config.publicApiUrl}`),
	);
	socketHttpServer.listen(config.wsPort, () =>
		console.log(`[Socket.io]: listening on ${config.wsPort}`),
	);
	timerService.start(); // Overdue database timers are drained here after every restart.
	void discordBot
		.start()
		.catch((error) =>
			console.error("[Discord Bot]: Failed to start", error),
		);
}

void start().catch((error) => {
	console.error("[Server]: Startup failed", error);
	process.exitCode = 1;
});

let shuttingDown = false;
/** Gracefully stops every server and background worker after a process signal. */
async function shutdown(signal: string): Promise<void> {
	if (shuttingDown) return;
	shuttingDown = true;
	console.info(`[Server]: ${signal}; shutting down`);
	timerService.stop();
	await discordBot.stop();
	await new Promise<void>((resolve) => io.close(() => resolve()));
	await new Promise<void>((resolve) => replayServer.close(() => resolve()));
	await Promise.all([
		restServer
			? new Promise<void>((resolve) => restServer!.close(() => resolve()))
			: Promise.resolve(),
		new Promise<void>((resolve) => socketHttpServer.close(() => resolve())),
	]);
	await closeDatabase();
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

export default app;
