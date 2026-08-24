# CompCube TypeScript Server

This is the TypeScript/PostgreSQL rewrite of the CompCube server. It is derived from BeatKhana's backend-ts.

## Running locally

1. Copy `.env.example` to `.env` and fill in the BeatKhana OAuth and optional Discord values.
2. Start PostgreSQL and run `npm run db:setup`.
3. Run `npm run dev:fast`.

The REST API defaults to `http://localhost:7198`, Swagger UI is at `/docs`, the OpenAPI JSON is at `/openapi.json`, and Socket.IO defaults to port `8008`.

`docker compose up --build` starts PostgreSQL, applies the Drizzle schema and PostgreSQL-only constraints, then starts both server listeners.

## Timer design

Match timers are database rows with an absolute `due_at`. A backend instance claims an overdue timer using a short lease, runs its idempotent handler and marks it completed. If the backend dies, another instance can claim the timer when the lease expires. Pausing a match saves the remaining milliseconds; resuming creates a new absolute deadline.

This means the process is never the source of truth for a timer. The database is.

## Authentication and account linking

Browser/native login uses BeatKhana OAuth with the `compcube` scope. Game clients use the same signed BeatKhana JWT after exchanging a Steam, Meta PC, or ScoreSaber proof with BeatKhana. `BK_CLIENT_ID` and `BK_CLIENT_SECRET` only come from the environment.

At startup the server fetches BeatKhana's RS256 public key from `BK_PUBLIC_KEY_URL`. Every REST and Socket.IO authentication verifies the JWT signature, `iat`/`nbf`/`exp` dates, and the required `compcube` scope locally; CompCube does not query BeatKhana for user details on each request.

Signed token identities are resolved in this order:

1. Steam: BeatLeader, then ScoreSaber
2. Oculus PC: BeatLeader, then ScoreSaber
3. Standalone/Quest: BeatLeader, then ScoreSaber

If BeatKhana has no linked platform ID, the Discord-only account is still created but cannot queue. Clients receive the configurable BeatKhana linking URL. If a later login finds both a Discord-only account and an existing platform account, the platform account remains canonical and the Discord-only row is removed.

An unlinked game token has null BeatKhana/Discord identity claims but always has a provider-verified platform ID. CompCube creates a platform-only account in that case. A later signed token containing Discord/BeatKhana data reconciles and links that account while preserving local roles, perks, bans, statistics, and gameplay ownership.

## Socket.IO

Packets use raw JSON and acknowledgements shaped as either:

```json
{ "ok": true, "data": {} }
```

or:

```json
{ "ok": false, "error": { "code": "ERROR_CODE", "message": "Human-readable message" } }
```

Every client packet lives in `src/websocket/packets/<packetName>/` with a `*.types.ts` contract and `*.packetHandler.ts` registration. Import reusable contracts from `src/websocket/index.ts`.

The machine-readable socket contract is served at `/socket-docs.json`. REST documentation is available through Swagger UI at `/docs` and as JSON at `/openapi.json`; routes are not prefixed with `/api` because the deployed hostname already provides that boundary.
