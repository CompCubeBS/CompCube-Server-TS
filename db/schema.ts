import { relations, sql } from "drizzle-orm";
import {
    boolean,
    check,
    customType,
    doublePrecision,
    foreignKey,
    index,
    integer,
    jsonb,
    pgEnum,
    pgTable,
    primaryKey,
    text,
    timestamp,
    unique,
    uniqueIndex,
    uuid,
    varchar,
} from "drizzle-orm/pg-core";

const timestamptz = (name: string) => timestamp(name, { withTimezone: true });
export const tstzrange = customType<{ data: string }>({ dataType: () => "tstzrange" });

export const permissionEnum = pgEnum("permission", ["role:admin", "role:dev", "role:pooler", "role:moderator", "role:player", "perk:supporter", "perk:contributor"]);
export const difficultyEnum = pgEnum("difficulty", ["Easy", "Normal", "Hard", "Expert", "ExpertPlus"]);
export const mapModifiersEnum = pgEnum("map_modifiers_abbr", [
    "NF", // No Fail
    "NW", // No Walls (No Obstacles)
    "NB", // No Bombs
    "NA", // No Arrows (dot notes)
    "SS", // Slower Song
    "FS", // Faster Song (≈ 120%)
    "SFS", // Super Fast Song (≈ 150%)
    "IF", // Insta-Fail (1 Life)
    "4L", // 4 Lives (Battery Energy)
    "DA", // Disappearing Arrows
    "GN", // Ghost Notes
    "PM", // Pro Mode
    "SA", // Strict Angles
    "SN", // Small Notes
    "ZM", // Zen Mode
]);
export const matchStatusEnum = pgEnum("match_status", ["waiting_players", "awaiting_discards", "awaiting_pick", "countdown", "playing", "awaiting_scores", "round_results", "paused", "completed", "aborted"]);
export const matchOutcomeKindEnum = pgEnum("match_outcome_kind", ["completed", "draw", "aborted", "forfeited", "server_error", "admin_decision", "other"]);
export const matchParticipantRoleEnum = pgEnum("match_participant_role", ["red", "blue", "spectator"]);
export const queuePlayerOneDecisionEnum = pgEnum("queue_player_one_decision", ["lowest_mmr_first", "highest_mmr_first", "random"]);
export const matchMapActionEnum = pgEnum("match_map_action", ["dealt", "discarded", "replacement", "picked"]);
export const timerKindEnum = pgEnum("timer_kind", ["discard", "pick", "map_countdown", "score_submission", "round_results", "disconnect_grace", "custom"]);
export const timerStatusEnum = pgEnum("timer_status", ["scheduled", "processing", "paused", "completed", "cancelled", "failed"]);
export const moderationActionEnum = pgEnum("moderation_action", ["timeout", "ban"]);

/**
 * Users Table
 * Core table storing user information and preferences.
 * A user can come from the plugin first, or from BeatKhana first, so only one of the ids is required.
 */
export const users = pgTable("users", {
    guid: uuid("guid").defaultRandom().primaryKey(),

    beatKhanaGuid: uuid("beatkhana_guid").unique(),
    discordId: varchar("discord_id", { length: 60 }).unique(),
    platformId: varchar("platform_id", { length: 60 }).unique(),

    username: varchar("username", { length: 255 }).notNull(),
    avatarUrl: text("avatar_url"),
    // Other fields like user about me(description) and others can be added if need be.
    permissions: permissionEnum("permissions").array().notNull().default(['role:player']),
    banned: boolean("banned").notNull().default(false),

    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
}, (table) => [
    check("users_has_identity", sql`${table.discordId} IS NOT NULL OR ${table.platformId} IS NOT NULL`),
    // POSIX digit classes avoid the migration generator rewriting numeric ranges incorrectly.
    check("users_discord_id_format", sql`${table.discordId} IS NULL OR ${table.discordId} ~ '^[[:digit:]]+$'`),
    check("users_platform_id_format", sql`${table.platformId} IS NULL OR ${table.platformId} ~ '^[[:digit:]]+$'`),
    unique("users_guid_platform_unique").on(table.guid, table.platformId),
]);

/**
 * User Moderation Actions Table
 * Bans live on the user for the quick permanent check. Timeouts live here so we keep who issued them,
 * why they were issued and whether they were manually removed before their natural expiration.
 */
export const userModerationActions = pgTable("user_moderation_actions", {
    guid: uuid("guid").defaultRandom().primaryKey(),

    userGuid: uuid("user_guid").notNull().references(() => users.guid, { onDelete: "cascade", onUpdate: "cascade" }),
    moderatorUserGuid: uuid("moderator_user_guid").references(() => users.guid, { onDelete: "set null", onUpdate: "cascade" }),

    action: moderationActionEnum("action").notNull(),
    reason: text("reason").notNull(),
    // This keeps automatic disconnect penalties separate from timeouts created by moderators.
    disconnectPenalty: boolean("disconnect_penalty").notNull().default(false),

    startsAt: timestamptz("starts_at").notNull().defaultNow(),
    endsAt: timestamptz("ends_at"),
    revokedAt: timestamptz("revoked_at"),
    revokedByUserGuid: uuid("revoked_by_user_guid").references(() => users.guid, { onDelete: "set null", onUpdate: "cascade" }),

    createdAt: timestamptz("created_at").notNull().defaultNow(),
}, (table) => [
    index("user_moderation_actions_user_time_idx").on(table.userGuid, table.startsAt, table.endsAt),
    index("user_moderation_actions_disconnect_penalty_idx").on(table.userGuid, table.disconnectPenalty, table.startsAt),
    check("user_moderation_actions_time_order", sql`${table.endsAt} IS NULL OR ${table.endsAt} > ${table.startsAt}`),
    check("user_moderation_actions_timeout_has_end", sql`${table.action} <> 'timeout' OR ${table.endsAt} IS NOT NULL`),
    check("user_moderation_actions_disconnect_is_timeout", sql`NOT ${table.disconnectPenalty} OR ${table.action} = 'timeout'`),
    check("user_moderation_actions_revoke_order", sql`${table.revokedAt} IS NULL OR ${table.revokedAt} >= ${table.startsAt}`),
]);

/**
 * Seasons Table
 * Competative Seasons are stored in this table.
 * activeRange is what lets PostgreSQL make sure two seasons can touch but never overlap.
 */
export const seasons = pgTable("seasons", {
    guid: uuid("guid").defaultRandom().primaryKey(),

    id: varchar("id", { length: 255 }).notNull().unique(),
    name: text("name").notNull(),
    description: text("description"),
    isCurrent: boolean("is_current").notNull().default(false),

    // New accounts begin the season at this MMR. Existing statistics keep their recorded starting MMR.
    startingMmr: integer("starting_mmr").notNull().default(1000),

    // While start time must always be defined, the ending may not
    // this allows a season to be forever, or limited.
    startsAt: timestamptz("starts_at").notNull(),
    endsAt: timestamptz("ends_at"),
    activeRange: tstzrange("active_range").generatedAlwaysAs(sql`tstzrange("starts_at", "ends_at", '[)')`),

    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
}, (table) => [
    check("seasons_valid_range", sql`${table.endsAt} IS NULL OR ${table.endsAt} > ${table.startsAt}`),
    check("seasons_starting_mmr_nonnegative", sql`${table.startingMmr} >= 0`),
    uniqueIndex("seasons_one_current_idx").on(table.isCurrent).where(sql`${table.isCurrent} = true`),
]);

/**
 * Competative Statistics Table
 * The table which stores the mmr at different seasons.
 * Includes starting at, ending at, wins and winstreaks so we do not lose season history.
 */
export const competitiveStatistics = pgTable("competitive_statistics", {
    guid: uuid("guid").defaultRandom().primaryKey(),

    userGuid: uuid("user_guid").notNull().references(() => users.guid, { onDelete: "cascade", onUpdate: "cascade" }),
    seasonGuid: uuid("season_guid").notNull().references(() => seasons.guid, { onDelete: "restrict", onUpdate: "cascade" }),

    // The current MMR of the user
    currentMmr: integer("current_mmr").notNull().default(1000),
    // The MMR of the user at the start of the season
    startingMmr: integer("starting_mmr").notNull().default(1000),
    // The MMR of the user at the end of the season
    endingMmr: integer("ending_mmr"),
    wins: integer("wins").notNull().default(0),
    totalGames: integer("total_games").notNull().default(0),
    winStreak: integer("win_streak").notNull().default(0),
    bestWinStreak: integer("best_win_streak").notNull().default(0),

    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
}, (table) => [
    unique("competitive_statistics_user_season_unique").on(table.userGuid, table.seasonGuid),
    check("competitive_statistics_mmr_nonnegative", sql`${table.currentMmr} >= 0 AND ${table.startingMmr} >= 0 AND (${table.endingMmr} IS NULL OR ${table.endingMmr} >= 0)`),
    check("competitive_statistics_counts_valid", sql`${table.wins} >= 0 AND ${table.totalGames} >= 0 AND ${table.wins} <= ${table.totalGames} AND ${table.winStreak} >= 0 AND ${table.bestWinStreak} >= ${table.winStreak}`),
]);

/**
 * Map Pools Table
 * The map pools of all seasons.
 */
export const seasonPools = pgTable("season_pools", {
    guid: uuid("guid").defaultRandom().primaryKey(),

    seasonGuid: uuid("season_guid").notNull().references(() => seasons.guid, { onDelete: "cascade", onUpdate: "cascade" }),

    name: varchar("name", { length: 255 }).notNull(),
    imageUrl: text("image_url"),
    isPublic: boolean("is_public").notNull().default(false),

    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
}, (table) => [
    unique("season_pools_name_unique").on(table.seasonGuid, table.name),
]);

/**
 * Flairs Table
 * Essentially the map categories.
 */
export const flairs = pgTable("flairs", {
    guid: uuid("guid").defaultRandom().primaryKey(),

    name: varchar("name", { length: 255 }).notNull().unique(),
    imageUrl: text("image_url"),
    color: varchar("color", { length: 9 }),

    createdAt: timestamptz("created_at").notNull().defaultNow(),
}, (table) => [
    check("flairs_color_hex", sql`${table.color} IS NULL OR ${table.color} ~ '^#[0-9A-Fa-f]{6}([0-9A-Fa-f]{2})?$'`),
]);

/**
 * Maps Table
 * Maps for the pools. Modifiers are stored here because the same chart can be played with a fixed ruleset.
 */
export const maps = pgTable("maps", {
    guid: uuid("guid").defaultRandom().primaryKey(),

    poolGuid: uuid("pool_guid").notNull().references(() => seasonPools.guid, { onDelete: "cascade", onUpdate: "cascade" }),
    // A map flair is the category like Speed, Extreme, so on. Optional ofc
    flairGuid: uuid("flair_guid").references(() => flairs.guid, { onDelete: "set null", onUpdate: "cascade" }),

    name: varchar("name", { length: 255 }).notNull(),
    imageUrl: text("image_url"),

    hash: varchar("hash", { length: 64 }).notNull(),
    key: varchar("key", { length: 16 }).notNull(),
    characteristic: varchar("characteristic", { length: 64 }).notNull().default("Standard"),
    difficulty: difficultyEnum("difficulty").notNull(),
    modifiers: mapModifiersEnum("modifiers").array().notNull().default(['NF']),
    durationSeconds: integer("duration_seconds").notNull(),
    maxScore: integer("max_score").notNull(),

    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
}, (table) => [
    unique("maps_pool_chart_unique").on(table.poolGuid, table.hash, table.characteristic, table.difficulty),
    check("maps_hash_format", sql`${table.hash} ~ '^[0-9A-Fa-f]{40}$'`),
    check("maps_duration_positive", sql`${table.durationSeconds} > 0`),
    check("maps_max_score_positive", sql`${table.maxScore} > 0`),
    check("maps_one_speed_modifier", sql`(
        (array_position(${table.modifiers}, 'SS'::map_modifiers_abbr) IS NOT NULL)::integer
        + (array_position(${table.modifiers}, 'FS'::map_modifiers_abbr) IS NOT NULL)::integer
        + (array_position(${table.modifiers}, 'SFS'::map_modifiers_abbr) IS NOT NULL)::integer
    ) <= 1`),
]);

/**
 * Queues Table
 * This table contains all of the queues.
 * It also contains how a queue obtains player 1(red).
 */
export const queues = pgTable("queues", {
    guid: uuid("guid").defaultRandom().primaryKey(),

    slug: varchar("slug", { length: 80 }).notNull().unique(),
    name: text("name").notNull(),
    poolGuid: uuid("pool_guid").notNull().references(() => seasonPools.guid, { onDelete: "restrict", onUpdate: "cascade" }),

    competitive: boolean("competitive").notNull().default(true),
    enabled: boolean("enabled").notNull().default(true),

    minMmr: integer("min_mmr").notNull().default(0),
    maxMmr: integer("max_mmr").notNull().default(100000),
    playerOneDecision: queuePlayerOneDecisionEnum("player_one_decision").notNull().default("lowest_mmr_first"),
    startingHealth: doublePrecision("starting_health").notNull().default(1),
    kFactor: integer("k_factor").notNull().default(100),

    // A queue must always have an opening time, but it is possible to never close
    opensAt: timestamptz("opens_at").notNull().defaultNow(),
    closesAt: timestamptz("closes_at"),

    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
}, (table) => [
    check("queues_mmr_range", sql`${table.minMmr} >= 0 AND ${table.maxMmr} >= ${table.minMmr}`),
    check("queues_time_range", sql`${table.closesAt} IS NULL OR ${table.closesAt} > ${table.opensAt}`),
    check("queues_health_positive", sql`${table.startingHealth} > 0`),
    check("queues_k_factor_positive", sql`${table.kFactor} > 0`),
]);

/**
 * Queued Players Table
 * A user can only be in one queue at once. The composite user/platform FK also means they cannot queue without a platform id.
 */
export const queuedPlayers = pgTable("queued_players", {
    guid: uuid("guid").defaultRandom().primaryKey(),

    queueGuid: uuid("queue_guid").notNull().references(() => queues.guid, { onDelete: "cascade", onUpdate: "cascade" }),
    userGuid: uuid("user_guid").notNull(),
    platformId: varchar("platform_id", { length: 60 }).notNull(),

    joinedAt: timestamptz("joined_at").notNull().defaultNow(),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
}, (table) => [
    uniqueIndex("queued_players_one_queue_per_user_idx").on(table.userGuid),
    foreignKey({ name: "queued_players_user_platform_fk", columns: [table.userGuid, table.platformId], foreignColumns: [users.guid, users.platformId] }).onDelete("cascade").onUpdate("cascade"),
    index("queued_players_queue_joined_idx").on(table.queueGuid, table.joinedAt),
]);

/**
 * Matches Table
 * All of the matches. In case anything has to be reverted we keep the result and every state change below.
 */
export const matches = pgTable("matches", {
    guid: uuid("guid").defaultRandom().primaryKey(),

    queueGuid: uuid("queue_guid").references(() => queues.guid, { onDelete: "restrict", onUpdate: "cascade" }),
    seasonGuid: uuid("season_guid").references(() => seasons.guid, { onDelete: "restrict", onUpdate: "cascade" }),
    poolGuid: uuid("pool_guid").references(() => seasonPools.guid, { onDelete: "restrict", onUpdate: "cascade" }),

    status: matchStatusEnum("status").notNull().default("waiting_players"),
    statusBeforePause: matchStatusEnum("status_before_pause"),
    outcomeKind: matchOutcomeKindEnum("outcome_kind"),
    outcomeReason: text("outcome_reason"),
    winnerUserGuid: uuid("winner_user_guid").references(() => users.guid, { onDelete: "restrict", onUpdate: "cascade" }),

    currentRound: integer("current_round").notNull().default(0),
    competitive: boolean("competitive").notNull().default(true),
    startingHealth: doublePrecision("starting_health").notNull().default(1),
    kFactor: integer("k_factor").notNull().default(100),
    winnerMmrGain: integer("winner_mmr_gain"),
    loserMmrLoss: integer("loser_mmr_loss"),

    // Mock matches are private development runs. They exercise the real state machine but never alter ratings.
    isMock: boolean("is_mock").notNull().default(false),
    mockOwnerUserGuid: uuid("mock_owner_user_guid").references(() => users.guid, { onDelete: "set null", onUpdate: "cascade" }),

    undone: boolean("undone_by_admin").notNull().default(false),
    version: integer("version").notNull().default(0),

    // Just for stats / info
    startedAt: timestamptz("started_at"),
    endedAt: timestamptz("ended_at"),

    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
}, (table) => [
    check("matches_round_nonnegative", sql`${table.currentRound} >= 0`),
    check("matches_health_positive", sql`${table.startingHealth} > 0`),
    check("matches_k_factor_positive", sql`${table.kFactor} > 0`),
    check("matches_time_order", sql`${table.endedAt} IS NULL OR ${table.startedAt} IS NULL OR ${table.endedAt} >= ${table.startedAt}`),
    check("matches_terminal_consistency", sql`(${table.status} IN ('completed', 'aborted')) = (${table.endedAt} IS NOT NULL)`),
    check("matches_winner_only_when_completed", sql`${table.winnerUserGuid} IS NULL OR ${table.status} = 'completed'`),
    check("matches_draw_has_no_winner", sql`${table.outcomeKind} <> 'draw' OR ${table.winnerUserGuid} IS NULL`),
    check("matches_mock_not_competitive", sql`NOT ${table.isMock} OR NOT ${table.competitive}`),
    check("matches_mock_has_owner", sql`NOT ${table.isMock} OR ${table.mockOwnerUserGuid} IS NOT NULL`),
]);

/**
 * Mock Clients Table
 * A dev controls these clients from the website while every action is still attributed to the impersonated player.
 */
export const mockClients = pgTable("mock_clients", {
    guid: uuid("guid").defaultRandom().primaryKey(),

    ownerUserGuid: uuid("owner_user_guid").notNull().references(() => users.guid, { onDelete: "cascade", onUpdate: "cascade" }),
    impersonatedUserGuid: uuid("impersonated_user_guid").notNull().references(() => users.guid, { onDelete: "cascade", onUpdate: "cascade" }),
    matchGuid: uuid("match_guid").references(() => matches.guid, { onDelete: "set null", onUpdate: "cascade" }),

    connected: boolean("connected").notNull().default(true),
    lastAction: varchar("last_action", { length: 80 }),
    lastActionAt: timestamptz("last_action_at"),
    expiresAt: timestamptz("expires_at").notNull(),

    createdAt: timestamptz("created_at").notNull().defaultNow(),
}, (table) => [
    unique("mock_clients_owner_impersonation_match_unique").on(table.ownerUserGuid, table.impersonatedUserGuid, table.matchGuid),
    index("mock_clients_match_idx").on(table.matchGuid),
    check("mock_clients_expiry_order", sql`${table.expiresAt} > ${table.createdAt}`),
]);

/**
 * Match Participants Table
 * This is separate from matches so we are not locked into only 1v1 forever.
 * The platform id is repeated on purpose so PostgreSQL itself can guarantee a real platform account is used.
 */
export const matchParticipants = pgTable("match_participants", {
    guid: uuid("guid").defaultRandom().primaryKey(),

    matchGuid: uuid("match_guid").notNull().references(() => matches.guid, { onDelete: "cascade", onUpdate: "cascade" }),
    userGuid: uuid("user_guid").notNull(),
    platformId: varchar("platform_id", { length: 60 }).notNull(),

    role: matchParticipantRoleEnum("role").notNull(),
    initialMmr: integer("initial_mmr").notNull(),
    finalMmr: integer("final_mmr"),
    health: doublePrecision("health").notNull().default(1),
    active: boolean("active").notNull().default(true),
    connected: boolean("connected").notNull().default(true),

    joinedAt: timestamptz("joined_at").notNull().defaultNow(),
    leftAt: timestamptz("left_at"),

    createdAt: timestamptz("created_at").notNull().defaultNow(),
}, (table) => [
    uniqueIndex("match_participants_competitor_role_unique_idx").on(table.matchGuid, table.role).where(sql`${table.role} <> 'spectator'`),
    uniqueIndex("match_participants_one_active_match_idx").on(table.userGuid).where(sql`${table.active} = true AND ${table.role} <> 'spectator'`),
    foreignKey({ name: "match_participants_user_platform_fk", columns: [table.userGuid, table.platformId], foreignColumns: [users.guid, users.platformId] }).onDelete("restrict").onUpdate("cascade"),
    check("match_participants_mmr_nonnegative", sql`${table.initialMmr} >= 0 AND (${table.finalMmr} IS NULL OR ${table.finalMmr} >= 0)`),
    check("match_participants_health_nonnegative", sql`${table.health} >= 0`),
    check("match_participants_left_consistency", sql`${table.active} OR ${table.leftAt} IS NOT NULL`),
]);

/**
 * Match Status History Table
 * matches.status is the fast current value, while this is the full audit history.
 */
export const matchStatusHistory = pgTable("match_status_history", {
    guid: uuid("guid").defaultRandom().primaryKey(),

    matchGuid: uuid("match_guid").notNull().references(() => matches.guid, { onDelete: "cascade", onUpdate: "cascade" }),

    fromStatus: matchStatusEnum("from_status"),
    toStatus: matchStatusEnum("to_status").notNull(),
    reason: text("reason"),
    actorUserGuid: uuid("actor_user_guid").references(() => users.guid, { onDelete: "set null", onUpdate: "cascade" }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),

    createdAt: timestamptz("created_at").notNull().defaultNow(),
}, (table) => [
    index("match_status_history_match_time_idx").on(table.matchGuid, table.createdAt),
]);

/**
 * Match Timers Table
 * Timers use an absolute due time, so if the backend dies it can pick up every overdue timer after it comes back.
 * The lease prevents two backend instances from firing the same timer at once.
 */
export const matchTimers = pgTable("match_timers", {
    guid: uuid("guid").defaultRandom().primaryKey(),

    matchGuid: uuid("match_guid").notNull().references(() => matches.guid, { onDelete: "cascade", onUpdate: "cascade" }),

    kind: timerKindEnum("kind").notNull(),
    status: timerStatusEnum("status").notNull().default("scheduled"),
    dueAt: timestamptz("due_at").notNull(),
    pausedRemainingMs: integer("paused_remaining_ms"),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    idempotencyKey: varchar("idempotency_key", { length: 255 }).notNull().unique(),

    leaseOwner: varchar("lease_owner", { length: 255 }),
    leaseExpiresAt: timestamptz("lease_expires_at"),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    completedAt: timestamptz("completed_at"),

    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
}, (table) => [
    index("match_timers_due_idx").on(table.status, table.dueAt),
    check("match_timers_attempts_nonnegative", sql`${table.attempts} >= 0`),
    check("match_timers_pause_consistency", sql`(${table.status} = 'paused') = (${table.pausedRemainingMs} IS NOT NULL)`),
    check("match_timers_remaining_nonnegative", sql`${table.pausedRemainingMs} IS NULL OR ${table.pausedRemainingMs} >= 0`),
]);

/**
 * Player Hands Table
 * The hand of a player in a match.
 */
export const matchHands = pgTable("match_hands", {
    guid: uuid("guid").defaultRandom().primaryKey(),

    matchGuid: uuid("match_guid").notNull().references(() => matches.guid, { onDelete: "cascade", onUpdate: "cascade" }),
    userGuid: uuid("user_guid").notNull().references(() => users.guid, { onDelete: "restrict", onUpdate: "cascade" }),

    discardedAt: timestamptz("discarded_at"),

    createdAt: timestamptz("created_at").notNull().defaultNow(),
}, (table) => [
    unique("match_hands_user_unique").on(table.matchGuid, table.userGuid),
]);

/**
 * Player Hand Maps Table
 * The maps currently or previously in a player hand. active tells us if it can still be picked.
 */
export const matchHandMaps = pgTable("match_hand_maps", {
    handGuid: uuid("hand_guid").notNull().references(() => matchHands.guid, { onDelete: "cascade", onUpdate: "cascade" }),
    mapGuid: uuid("map_guid").notNull().references(() => maps.guid, { onDelete: "restrict", onUpdate: "cascade" }),

    position: integer("position").notNull(),
    active: boolean("active").notNull().default(true),

    createdAt: timestamptz("created_at").notNull().defaultNow(),
}, (table) => [
    primaryKey({ columns: [table.handGuid, table.mapGuid] }),
    unique("match_hand_maps_position_unique").on(table.handGuid, table.position),
    check("match_hand_maps_position_nonnegative", sql`${table.position} >= 0`),
]);

/**
 * Match Map Actions Table
 * Every dealt, replacement, discard and pick is saved instead of only saving the final hand.
 */
export const matchMapActions = pgTable("match_map_actions", {
    guid: uuid("guid").defaultRandom().primaryKey(),

    matchGuid: uuid("match_guid").notNull().references(() => matches.guid, { onDelete: "cascade", onUpdate: "cascade" }),
    userGuid: uuid("user_guid").notNull().references(() => users.guid, { onDelete: "restrict", onUpdate: "cascade" }),
    mapGuid: uuid("map_guid").notNull().references(() => maps.guid, { onDelete: "restrict", onUpdate: "cascade" }),

    roundNumber: integer("round_number"),
    action: matchMapActionEnum("action").notNull(),

    createdAt: timestamptz("created_at").notNull().defaultNow(),
}, (table) => [
    index("match_map_actions_match_idx").on(table.matchGuid, table.createdAt),
    check("match_map_actions_round_positive", sql`${table.roundNumber} IS NULL OR ${table.roundNumber} > 0`),
]);

/**
 * Match Rounds Table
 * Stores who picked, what was played, the multiplier and who won every round.
 */
export const matchRounds = pgTable("match_rounds", {
    guid: uuid("guid").defaultRandom().primaryKey(),

    matchGuid: uuid("match_guid").notNull().references(() => matches.guid, { onDelete: "cascade", onUpdate: "cascade" }),
    roundNumber: integer("round_number").notNull(),
    pickerUserGuid: uuid("picker_user_guid").notNull().references(() => users.guid, { onDelete: "restrict", onUpdate: "cascade" }),
    mapGuid: uuid("map_guid").references(() => maps.guid, { onDelete: "restrict", onUpdate: "cascade" }),
    winnerUserGuid: uuid("winner_user_guid").references(() => users.guid, { onDelete: "restrict", onUpdate: "cascade" }),

    damageMultiplier: doublePrecision("damage_multiplier").notNull().default(1),

    startedAt: timestamptz("started_at").notNull().defaultNow(),
    scoreSubmissionDueAt: timestamptz("score_submission_due_at"),
    endedAt: timestamptz("ended_at"),

    createdAt: timestamptz("created_at").notNull().defaultNow(),
}, (table) => [
    unique("match_rounds_number_unique").on(table.matchGuid, table.roundNumber),
    check("match_rounds_number_positive", sql`${table.roundNumber} > 0`),
    check("match_rounds_multiplier_positive", sql`${table.damageMultiplier} > 0`),
    check("match_rounds_score_deadline_order", sql`${table.scoreSubmissionDueAt} IS NULL OR ${table.scoreSubmissionDueAt} >= ${table.startedAt}`),
    check("match_rounds_time_order", sql`${table.endedAt} IS NULL OR ${table.endedAt} >= ${table.startedAt}`),
]);

/**
 * Match Scores Table
 * All of the match scores.
 * All (seriously, every) piece of information that is or can be provided to the server.
 * This is every value the current plugin can submit, plus health and damage calculated by the server.
 */
export const matchScores = pgTable("match_scores", {
    guid: uuid("guid").defaultRandom().primaryKey(),

    roundGuid: uuid("round_guid").notNull().references(() => matchRounds.guid, { onDelete: "cascade", onUpdate: "cascade" }),
    userGuid: uuid("user_guid").notNull().references(() => users.guid, { onDelete: "restrict", onUpdate: "cascade" }),

    // rawScore is the unmodified game score. modifiedScore is kept for audit/display only.
    rawScore: integer("raw_score").notNull(),
    modifiedScore: integer("modified_score").notNull(),
    clientReportedModifiedScore: integer("client_reported_modified_score"),
    maxScore: integer("max_score").notNull(),
    // Accuracy is stored as a ratio, so 0.97325 means 97.325% accuracy.
    accuracy: doublePrecision("accuracy").notNull(),
    proMode: boolean("pro_mode").notNull(),
    missCount: integer("miss_count").notNull(),
    fullCombo: boolean("full_combo").notNull(),
    modifiers: mapModifiersEnum("modifiers").array().notNull().default(['NF']),
    timedOut: boolean("timed_out").notNull().default(false),
    noFailTriggered: boolean("no_fail_triggered").notNull().default(false),

    healthBefore: doublePrecision("health_before").notNull(),
    damageTaken: doublePrecision("damage_taken").notNull().default(0),
    healthAfter: doublePrecision("health_after").notNull(),

    submittedAt: timestamptz("submitted_at"),

    createdAt: timestamptz("created_at").notNull().defaultNow(),
}, (table) => [
    unique("match_scores_round_user_unique").on(table.roundGuid, table.userGuid),
    check("match_scores_values_nonnegative", sql`${table.rawScore} >= 0 AND ${table.modifiedScore} >= 0 AND (${table.clientReportedModifiedScore} IS NULL OR ${table.clientReportedModifiedScore} >= 0) AND ${table.maxScore} > 0 AND ${table.missCount} >= 0`),
    check("match_scores_raw_within_max", sql`${table.rawScore} <= ${table.maxScore}`),
    check("match_scores_accuracy_range", sql`${table.accuracy} >= 0 AND ${table.accuracy} <= 1`),
    check("match_scores_accuracy_consistency", sql`abs(${table.accuracy} - (${table.rawScore}::double precision / ${table.maxScore})) < 0.000000001`),
    check("match_scores_timeout_consistency", sql`NOT ${table.timedOut} OR (${table.rawScore} = 0 AND ${table.modifiedScore} = 0 AND ${table.accuracy} = 0 AND NOT ${table.fullCombo} AND ${table.submittedAt} IS NULL)`),
    check("match_scores_health_valid", sql`${table.healthBefore} >= 0 AND ${table.damageTaken} >= 0 AND ${table.healthAfter} >= 0 AND ${table.healthAfter} <= ${table.healthBefore}`),
    check("match_scores_damage_consistency", sql`abs(${table.healthAfter} - GREATEST(0, ${table.healthBefore} - ${table.damageTaken})) < 0.000000001`),
    check("match_scores_full_combo_consistency", sql`NOT ${table.fullCombo} OR ${table.missCount} = 0`),
]);

/**
 * OAuth States Table
 * Temporary login state used to safely finish the BeatKhana OAuth flow.
 */
export const oauthStates = pgTable("oauth_states", {
    stateHash: varchar("state_hash", { length: 64 }).primaryKey(),

    returnTo: text("return_to").notNull().default("/"),
    responseMode: varchar("response_mode", { length: 16 }).notNull().default("redirect"),

    expiresAt: timestamptz("expires_at").notNull(),
    consumedAt: timestamptz("consumed_at"),

    createdAt: timestamptz("created_at").notNull().defaultNow(),
}, (table) => [
    index("oauth_states_expiry_idx").on(table.expiresAt),
    check("oauth_states_mode", sql`${table.responseMode} IN ('redirect', 'json')`),
]);

/**
 * Relations
 * Every table association is kept here so it can be reused with Drizzle's relational queries.
 */
export const usersRelations = relations(users, ({ many }) => ({
    competitiveStatistics: many(competitiveStatistics),
    queueEntries: many(queuedPlayers),
    matchParticipants: many(matchParticipants),
    hands: many(matchHands),
    mapActions: many(matchMapActions),
    statusChanges: many(matchStatusHistory),
    scores: many(matchScores),
    wonMatches: many(matches, { relationName: "matchWinner" }),
    pickedRounds: many(matchRounds, { relationName: "roundPicker" }),
    wonRounds: many(matchRounds, { relationName: "roundWinner" }),
    moderationActions: many(userModerationActions, { relationName: "moderatedUser" }),
    issuedModerationActions: many(userModerationActions, { relationName: "moderationActor" }),
    revokedModerationActions: many(userModerationActions, { relationName: "moderationRevoker" }),
    ownedMockMatches: many(matches, { relationName: "mockOwner" }),
    ownedMockClients: many(mockClients, { relationName: "mockClientOwner" }),
    mockClientIdentities: many(mockClients, { relationName: "mockClientIdentity" }),
}));

export const userModerationActionsRelations = relations(userModerationActions, ({ one }) => ({
    user: one(users, {
        fields: [userModerationActions.userGuid],
        references: [users.guid],
        relationName: "moderatedUser",
    }),
    moderator: one(users, {
        fields: [userModerationActions.moderatorUserGuid],
        references: [users.guid],
        relationName: "moderationActor",
    }),
    revokedBy: one(users, {
        fields: [userModerationActions.revokedByUserGuid],
        references: [users.guid],
        relationName: "moderationRevoker",
    }),
}));

export const seasonsRelations = relations(seasons, ({ many }) => ({
    competitiveStatistics: many(competitiveStatistics),
    pools: many(seasonPools),
    matches: many(matches),
}));

export const competitiveStatisticsRelations = relations(competitiveStatistics, ({ one }) => ({
    user: one(users, {
        fields: [competitiveStatistics.userGuid],
        references: [users.guid],
    }),
    season: one(seasons, {
        fields: [competitiveStatistics.seasonGuid],
        references: [seasons.guid],
    }),
}));

export const seasonPoolsRelations = relations(seasonPools, ({ one, many }) => ({
    season: one(seasons, {
        fields: [seasonPools.seasonGuid],
        references: [seasons.guid],
    }),
    maps: many(maps),
    queues: many(queues),
    matches: many(matches),
}));

export const flairsRelations = relations(flairs, ({ many }) => ({
    maps: many(maps),
}));

export const mapsRelations = relations(maps, ({ one, many }) => ({
    pool: one(seasonPools, {
        fields: [maps.poolGuid],
        references: [seasonPools.guid],
    }),
    flair: one(flairs, {
        fields: [maps.flairGuid],
        references: [flairs.guid],
    }),
    handMaps: many(matchHandMaps),
    actions: many(matchMapActions),
    rounds: many(matchRounds),
}));

export const queuesRelations = relations(queues, ({ one, many }) => ({
    pool: one(seasonPools, {
        fields: [queues.poolGuid],
        references: [seasonPools.guid],
    }),
    players: many(queuedPlayers),
    matches: many(matches),
}));

export const queuedPlayersRelations = relations(queuedPlayers, ({ one }) => ({
    queue: one(queues, {
        fields: [queuedPlayers.queueGuid],
        references: [queues.guid],
    }),
    user: one(users, {
        fields: [queuedPlayers.userGuid],
        references: [users.guid],
    }),
}));

export const matchesRelations = relations(matches, ({ one, many }) => ({
    queue: one(queues, {
        fields: [matches.queueGuid],
        references: [queues.guid],
    }),
    season: one(seasons, {
        fields: [matches.seasonGuid],
        references: [seasons.guid],
    }),
    pool: one(seasonPools, {
        fields: [matches.poolGuid],
        references: [seasonPools.guid],
    }),
    winner: one(users, {
        fields: [matches.winnerUserGuid],
        references: [users.guid],
        relationName: "matchWinner",
    }),
    mockOwner: one(users, {
        fields: [matches.mockOwnerUserGuid],
        references: [users.guid],
        relationName: "mockOwner",
    }),
    mockClients: many(mockClients),
    participants: many(matchParticipants),
    statusHistory: many(matchStatusHistory),
    timers: many(matchTimers),
    hands: many(matchHands),
    mapActions: many(matchMapActions),
    rounds: many(matchRounds),
}));

export const mockClientsRelations = relations(mockClients, ({ one }) => ({
    owner: one(users, {
        fields: [mockClients.ownerUserGuid],
        references: [users.guid],
        relationName: "mockClientOwner",
    }),
    impersonatedUser: one(users, {
        fields: [mockClients.impersonatedUserGuid],
        references: [users.guid],
        relationName: "mockClientIdentity",
    }),
    match: one(matches, {
        fields: [mockClients.matchGuid],
        references: [matches.guid],
    }),
}));

export const matchParticipantsRelations = relations(matchParticipants, ({ one }) => ({
    match: one(matches, {
        fields: [matchParticipants.matchGuid],
        references: [matches.guid],
    }),
    user: one(users, {
        fields: [matchParticipants.userGuid],
        references: [users.guid],
    }),
}));

export const matchStatusHistoryRelations = relations(matchStatusHistory, ({ one }) => ({
    match: one(matches, {
        fields: [matchStatusHistory.matchGuid],
        references: [matches.guid],
    }),
    actor: one(users, {
        fields: [matchStatusHistory.actorUserGuid],
        references: [users.guid],
    }),
}));

export const matchTimersRelations = relations(matchTimers, ({ one }) => ({
    match: one(matches, {
        fields: [matchTimers.matchGuid],
        references: [matches.guid],
    }),
}));

export const matchHandsRelations = relations(matchHands, ({ one, many }) => ({
    match: one(matches, {
        fields: [matchHands.matchGuid],
        references: [matches.guid],
    }),
    user: one(users, {
        fields: [matchHands.userGuid],
        references: [users.guid],
    }),
    maps: many(matchHandMaps),
}));

export const matchHandMapsRelations = relations(matchHandMaps, ({ one }) => ({
    hand: one(matchHands, {
        fields: [matchHandMaps.handGuid],
        references: [matchHands.guid],
    }),
    map: one(maps, {
        fields: [matchHandMaps.mapGuid],
        references: [maps.guid],
    }),
}));

export const matchMapActionsRelations = relations(matchMapActions, ({ one }) => ({
    match: one(matches, {
        fields: [matchMapActions.matchGuid],
        references: [matches.guid],
    }),
    user: one(users, {
        fields: [matchMapActions.userGuid],
        references: [users.guid],
    }),
    map: one(maps, {
        fields: [matchMapActions.mapGuid],
        references: [maps.guid],
    }),
}));

export const matchRoundsRelations = relations(matchRounds, ({ one, many }) => ({
    match: one(matches, {
        fields: [matchRounds.matchGuid],
        references: [matches.guid],
    }),
    picker: one(users, {
        fields: [matchRounds.pickerUserGuid],
        references: [users.guid],
        relationName: "roundPicker",
    }),
    winner: one(users, {
        fields: [matchRounds.winnerUserGuid],
        references: [users.guid],
        relationName: "roundWinner",
    }),
    map: one(maps, {
        fields: [matchRounds.mapGuid],
        references: [maps.guid],
    }),
    scores: many(matchScores),
}));

export const matchScoresRelations = relations(matchScores, ({ one }) => ({
    round: one(matchRounds, {
        fields: [matchScores.roundGuid],
        references: [matchRounds.guid],
    }),
    user: one(users, {
        fields: [matchScores.userGuid],
        references: [users.guid],
    }),
}));

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Match = typeof matches.$inferSelect;
export type MatchTimer = typeof matchTimers.$inferSelect;
