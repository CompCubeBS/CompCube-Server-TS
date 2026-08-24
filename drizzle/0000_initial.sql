CREATE TYPE "public"."difficulty" AS ENUM('Easy', 'Normal', 'Hard', 'Expert', 'ExpertPlus');--> statement-breakpoint
CREATE TYPE "public"."map_modifiers_abbr" AS ENUM('NF', 'NW', 'NB', 'NA', 'SS', 'FS', 'SFS', 'IF', '4L', 'DA', 'GN', 'PM', 'SA', 'SN', 'ZM');--> statement-breakpoint
CREATE TYPE "public"."match_map_action" AS ENUM('dealt', 'discarded', 'replacement', 'picked');--> statement-breakpoint
CREATE TYPE "public"."match_outcome_kind" AS ENUM('completed', 'aborted', 'forfeited', 'server_error', 'admin_decision', 'other');--> statement-breakpoint
CREATE TYPE "public"."match_participant_role" AS ENUM('red', 'blue', 'spectator');--> statement-breakpoint
CREATE TYPE "public"."match_status" AS ENUM('waiting_players', 'awaiting_discards', 'awaiting_pick', 'countdown', 'playing', 'awaiting_scores', 'round_results', 'paused', 'completed', 'aborted');--> statement-breakpoint
CREATE TYPE "public"."permission" AS ENUM('role:admin', 'role:dev', 'role:pooler', 'role:moderator', 'role:player', 'perk:supporter');--> statement-breakpoint
CREATE TYPE "public"."queue_player_one_decision" AS ENUM('lowest_mmr_first', 'highest_mmr_first', 'random');--> statement-breakpoint
CREATE TYPE "public"."timer_kind" AS ENUM('discard', 'pick', 'map_countdown', 'score_submission', 'round_results', 'disconnect_grace', 'custom');--> statement-breakpoint
CREATE TYPE "public"."timer_status" AS ENUM('scheduled', 'processing', 'paused', 'completed', 'cancelled', 'failed');--> statement-breakpoint
CREATE TABLE "competitive_statistics" (
	"guid" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_guid" uuid NOT NULL,
	"season_guid" uuid NOT NULL,
	"current_mmr" integer DEFAULT 1000 NOT NULL,
	"starting_mmr" integer DEFAULT 1000 NOT NULL,
	"ending_mmr" integer,
	"wins" integer DEFAULT 0 NOT NULL,
	"total_games" integer DEFAULT 0 NOT NULL,
	"win_streak" integer DEFAULT 0 NOT NULL,
	"best_win_streak" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "competitive_statistics_user_season_unique" UNIQUE("user_guid","season_guid"),
	CONSTRAINT "competitive_statistics_mmr_nonnegative" CHECK ("competitive_statistics"."current_mmr" >= 0 AND "competitive_statistics"."starting_mmr" >= 0 AND ("competitive_statistics"."ending_mmr" IS NULL OR "competitive_statistics"."ending_mmr" >= 0)),
	CONSTRAINT "competitive_statistics_counts_valid" CHECK ("competitive_statistics"."wins" >= 0 AND "competitive_statistics"."total_games" >= 0 AND "competitive_statistics"."wins" <= "competitive_statistics"."total_games" AND "competitive_statistics"."win_streak" >= 0 AND "competitive_statistics"."best_win_streak" >= "competitive_statistics"."win_streak")
);
--> statement-breakpoint
CREATE TABLE "flairs" (
	"guid" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"image_url" text,
	"color" varchar(9),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "flairs_name_unique" UNIQUE("name"),
	CONSTRAINT "flairs_color_hex" CHECK ("flairs"."color" IS NULL OR "flairs"."color" ~ '^#[0-9A-Fa-f]{6}([0-9A-Fa-f]{2})?$')
);
--> statement-breakpoint
CREATE TABLE "maps" (
	"guid" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pool_guid" uuid NOT NULL,
	"flair_guid" uuid,
	"name" varchar(255) NOT NULL,
	"image_url" text,
	"hash" varchar(64) NOT NULL,
	"key" varchar(16) NOT NULL,
	"characteristic" varchar(64) DEFAULT 'Standard' NOT NULL,
	"difficulty" "difficulty" NOT NULL,
	"modifiers" "map_modifiers_abbr"[] DEFAULT '{"NF"}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "maps_pool_chart_unique" UNIQUE("pool_guid","hash","characteristic","difficulty"),
	CONSTRAINT "maps_hash_format" CHECK ("maps"."hash" ~ '^[0-9A-Fa-f]{40}$')
);
--> statement-breakpoint
CREATE TABLE "match_hand_maps" (
	"hand_guid" uuid NOT NULL,
	"map_guid" uuid NOT NULL,
	"position" integer NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "match_hand_maps_hand_guid_map_guid_pk" PRIMARY KEY("hand_guid","map_guid"),
	CONSTRAINT "match_hand_maps_position_unique" UNIQUE("hand_guid","position"),
	CONSTRAINT "match_hand_maps_position_nonnegative" CHECK ("match_hand_maps"."position" >= 0)
);
--> statement-breakpoint
CREATE TABLE "match_hands" (
	"guid" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"match_guid" uuid NOT NULL,
	"user_guid" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "match_hands_user_unique" UNIQUE("match_guid","user_guid")
);
--> statement-breakpoint
CREATE TABLE "match_map_actions" (
	"guid" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"match_guid" uuid NOT NULL,
	"user_guid" uuid NOT NULL,
	"map_guid" uuid NOT NULL,
	"round_number" integer,
	"action" "match_map_action" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "match_map_actions_round_positive" CHECK ("match_map_actions"."round_number" IS NULL OR "match_map_actions"."round_number" > 0)
);
--> statement-breakpoint
CREATE TABLE "match_participants" (
	"guid" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"match_guid" uuid NOT NULL,
	"user_guid" uuid NOT NULL,
	"platform_id" varchar(60) NOT NULL,
	"role" "match_participant_role" NOT NULL,
	"initial_mmr" integer NOT NULL,
	"final_mmr" integer,
	"health" double precision DEFAULT 1 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"connected" boolean DEFAULT true NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"left_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "match_participants_mmr_nonnegative" CHECK ("match_participants"."initial_mmr" >= 0 AND ("match_participants"."final_mmr" IS NULL OR "match_participants"."final_mmr" >= 0)),
	CONSTRAINT "match_participants_health_nonnegative" CHECK ("match_participants"."health" >= 0),
	CONSTRAINT "match_participants_left_consistency" CHECK ("match_participants"."active" OR "match_participants"."left_at" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "match_rounds" (
	"guid" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"match_guid" uuid NOT NULL,
	"round_number" integer NOT NULL,
	"picker_user_guid" uuid NOT NULL,
	"map_guid" uuid,
	"winner_user_guid" uuid,
	"damage_multiplier" double precision DEFAULT 1 NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "match_rounds_number_unique" UNIQUE("match_guid","round_number"),
	CONSTRAINT "match_rounds_number_positive" CHECK ("match_rounds"."round_number" > 0),
	CONSTRAINT "match_rounds_multiplier_positive" CHECK ("match_rounds"."damage_multiplier" > 0),
	CONSTRAINT "match_rounds_time_order" CHECK ("match_rounds"."ended_at" IS NULL OR "match_rounds"."ended_at" >= "match_rounds"."started_at")
);
--> statement-breakpoint
CREATE TABLE "match_scores" (
	"guid" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"round_guid" uuid NOT NULL,
	"user_guid" uuid NOT NULL,
	"modified_score" integer NOT NULL,
	"max_score" integer NOT NULL,
	"accuracy" double precision NOT NULL,
	"pro_mode" boolean NOT NULL,
	"miss_count" integer NOT NULL,
	"full_combo" boolean NOT NULL,
	"modifiers" "map_modifiers_abbr"[] DEFAULT '{"NF"}' NOT NULL,
	"health_before" double precision NOT NULL,
	"damage_taken" double precision DEFAULT 0 NOT NULL,
	"health_after" double precision NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "match_scores_round_user_unique" UNIQUE("round_guid","user_guid"),
	CONSTRAINT "match_scores_values_nonnegative" CHECK ("match_scores"."modified_score" >= 0 AND "match_scores"."max_score" > 0 AND "match_scores"."miss_count" >= 0),
	CONSTRAINT "match_scores_accuracy_range" CHECK ("match_scores"."accuracy" >= 0 AND "match_scores"."accuracy" <= 1),
	CONSTRAINT "match_scores_accuracy_consistency" CHECK (abs("match_scores"."accuracy" - ("match_scores"."modified_score"::double precision / "match_scores"."max_score")) < 0.000000001),
	CONSTRAINT "match_scores_health_valid" CHECK ("match_scores"."health_before" >= 0 AND "match_scores"."damage_taken" >= 0 AND "match_scores"."health_after" >= 0 AND "match_scores"."health_after" <= "match_scores"."health_before"),
	CONSTRAINT "match_scores_damage_consistency" CHECK (abs("match_scores"."health_after" - GREATEST(0, "match_scores"."health_before" - "match_scores"."damage_taken")) < 0.000000001),
	CONSTRAINT "match_scores_full_combo_consistency" CHECK (NOT "match_scores"."full_combo" OR "match_scores"."miss_count" = 0)
);
--> statement-breakpoint
CREATE TABLE "match_status_history" (
	"guid" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"match_guid" uuid NOT NULL,
	"from_status" "match_status",
	"to_status" "match_status" NOT NULL,
	"reason" text,
	"actor_user_guid" uuid,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "match_timers" (
	"guid" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"match_guid" uuid NOT NULL,
	"kind" timer_kind NOT NULL,
	"status" timer_status DEFAULT 'scheduled' NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"paused_remaining_ms" integer,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"idempotency_key" varchar(255) NOT NULL,
	"lease_owner" varchar(255),
	"lease_expires_at" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "match_timers_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "match_timers_attempts_nonnegative" CHECK ("match_timers"."attempts" >= 0),
	CONSTRAINT "match_timers_pause_consistency" CHECK (("match_timers"."status" = 'paused') = ("match_timers"."paused_remaining_ms" IS NOT NULL)),
	CONSTRAINT "match_timers_remaining_nonnegative" CHECK ("match_timers"."paused_remaining_ms" IS NULL OR "match_timers"."paused_remaining_ms" >= 0)
);
--> statement-breakpoint
CREATE TABLE "matches" (
	"guid" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"queue_guid" uuid,
	"season_guid" uuid,
	"pool_guid" uuid,
	"status" "match_status" DEFAULT 'waiting_players' NOT NULL,
	"status_before_pause" "match_status",
	"outcome_kind" "match_outcome_kind",
	"outcome_reason" text,
	"winner_user_guid" uuid,
	"current_round" integer DEFAULT 0 NOT NULL,
	"starting_health" double precision DEFAULT 1 NOT NULL,
	"k_factor" integer DEFAULT 100 NOT NULL,
	"winner_mmr_gain" integer,
	"loser_mmr_loss" integer,
	"undone_by_admin" boolean DEFAULT false NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "matches_round_nonnegative" CHECK ("matches"."current_round" >= 0),
	CONSTRAINT "matches_health_positive" CHECK ("matches"."starting_health" > 0),
	CONSTRAINT "matches_k_factor_positive" CHECK ("matches"."k_factor" > 0),
	CONSTRAINT "matches_time_order" CHECK ("matches"."ended_at" IS NULL OR "matches"."started_at" IS NULL OR "matches"."ended_at" >= "matches"."started_at"),
	CONSTRAINT "matches_terminal_consistency" CHECK (("matches"."status" IN ('completed', 'aborted')) = ("matches"."ended_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "oauth_states" (
	"state_hash" varchar(64) PRIMARY KEY NOT NULL,
	"return_to" text DEFAULT '/' NOT NULL,
	"response_mode" varchar(16) DEFAULT 'redirect' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "oauth_states_mode" CHECK ("oauth_states"."response_mode" IN ('redirect', 'json'))
);
--> statement-breakpoint
CREATE TABLE "queued_players" (
	"guid" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"queue_guid" uuid NOT NULL,
	"user_guid" uuid NOT NULL,
	"platform_id" varchar(60) NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "queues" (
	"guid" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" varchar(80) NOT NULL,
	"name" text NOT NULL,
	"pool_guid" uuid,
	"competitive" boolean DEFAULT true NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"min_mmr" integer DEFAULT 0 NOT NULL,
	"max_mmr" integer DEFAULT 100000 NOT NULL,
	"player_one_decision" "queue_player_one_decision" DEFAULT 'lowest_mmr_first' NOT NULL,
	"starting_health" double precision DEFAULT 1 NOT NULL,
	"k_factor" integer DEFAULT 100 NOT NULL,
	"opens_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closes_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "queues_slug_unique" UNIQUE("slug"),
	CONSTRAINT "queues_mmr_range" CHECK ("queues"."min_mmr" >= 0 AND "queues"."max_mmr" >= "queues"."min_mmr"),
	CONSTRAINT "queues_time_range" CHECK ("queues"."closes_at" IS NULL OR "queues"."closes_at" > "queues"."opens_at"),
	CONSTRAINT "queues_health_positive" CHECK ("queues"."starting_health" > 0),
	CONSTRAINT "queues_k_factor_positive" CHECK ("queues"."k_factor" > 0)
);
--> statement-breakpoint
CREATE TABLE "season_pools" (
	"guid" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"season_guid" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"image_url" text,
	"is_public" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "season_pools_name_unique" UNIQUE("season_guid","name")
);
--> statement-breakpoint
CREATE TABLE "seasons" (
	"guid" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"id" varchar(255) NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"is_current" boolean DEFAULT false NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone,
	"active_range" "tstzrange" GENERATED ALWAYS AS (tstzrange("starts_at", "ends_at", '[)')) STORED,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "seasons_id_unique" UNIQUE("id"),
	CONSTRAINT "seasons_valid_range" CHECK ("seasons"."ends_at" IS NULL OR "seasons"."ends_at" > "seasons"."starts_at")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"guid" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"beatkhana_guid" uuid,
	"discord_id" varchar(60),
	"platform_id" varchar(60),
	"username" varchar(255) NOT NULL,
	"avatar_url" text,
	"permissions" "permission"[] DEFAULT '{"role:player"}' NOT NULL,
	"banned" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_beatkhana_guid_unique" UNIQUE("beatkhana_guid"),
	CONSTRAINT "users_discord_id_unique" UNIQUE("discord_id"),
	CONSTRAINT "users_platform_id_unique" UNIQUE("platform_id"),
	CONSTRAINT "users_guid_platform_unique" UNIQUE("guid","platform_id"),
	CONSTRAINT "users_has_identity" CHECK ("users"."discord_id" IS NOT NULL OR "users"."platform_id" IS NOT NULL),
	CONSTRAINT "users_discord_id_format" CHECK ("users"."discord_id" IS NULL OR "users"."discord_id" ~ '^[[:digit:]]+$'),
	CONSTRAINT "users_platform_id_format" CHECK ("users"."platform_id" IS NULL OR "users"."platform_id" ~ '^[[:digit:]]+$')
);
--> statement-breakpoint
ALTER TABLE "competitive_statistics" ADD CONSTRAINT "competitive_statistics_user_guid_users_guid_fk" FOREIGN KEY ("user_guid") REFERENCES "public"."users"("guid") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "competitive_statistics" ADD CONSTRAINT "competitive_statistics_season_guid_seasons_guid_fk" FOREIGN KEY ("season_guid") REFERENCES "public"."seasons"("guid") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "maps" ADD CONSTRAINT "maps_pool_guid_season_pools_guid_fk" FOREIGN KEY ("pool_guid") REFERENCES "public"."season_pools"("guid") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "maps" ADD CONSTRAINT "maps_flair_guid_flairs_guid_fk" FOREIGN KEY ("flair_guid") REFERENCES "public"."flairs"("guid") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "match_hand_maps" ADD CONSTRAINT "match_hand_maps_hand_guid_match_hands_guid_fk" FOREIGN KEY ("hand_guid") REFERENCES "public"."match_hands"("guid") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "match_hand_maps" ADD CONSTRAINT "match_hand_maps_map_guid_maps_guid_fk" FOREIGN KEY ("map_guid") REFERENCES "public"."maps"("guid") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "match_hands" ADD CONSTRAINT "match_hands_match_guid_matches_guid_fk" FOREIGN KEY ("match_guid") REFERENCES "public"."matches"("guid") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "match_hands" ADD CONSTRAINT "match_hands_user_guid_users_guid_fk" FOREIGN KEY ("user_guid") REFERENCES "public"."users"("guid") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "match_map_actions" ADD CONSTRAINT "match_map_actions_match_guid_matches_guid_fk" FOREIGN KEY ("match_guid") REFERENCES "public"."matches"("guid") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "match_map_actions" ADD CONSTRAINT "match_map_actions_user_guid_users_guid_fk" FOREIGN KEY ("user_guid") REFERENCES "public"."users"("guid") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "match_map_actions" ADD CONSTRAINT "match_map_actions_map_guid_maps_guid_fk" FOREIGN KEY ("map_guid") REFERENCES "public"."maps"("guid") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "match_participants" ADD CONSTRAINT "match_participants_match_guid_matches_guid_fk" FOREIGN KEY ("match_guid") REFERENCES "public"."matches"("guid") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "match_participants" ADD CONSTRAINT "match_participants_user_platform_fk" FOREIGN KEY ("user_guid","platform_id") REFERENCES "public"."users"("guid","platform_id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "match_rounds" ADD CONSTRAINT "match_rounds_match_guid_matches_guid_fk" FOREIGN KEY ("match_guid") REFERENCES "public"."matches"("guid") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "match_rounds" ADD CONSTRAINT "match_rounds_picker_user_guid_users_guid_fk" FOREIGN KEY ("picker_user_guid") REFERENCES "public"."users"("guid") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "match_rounds" ADD CONSTRAINT "match_rounds_map_guid_maps_guid_fk" FOREIGN KEY ("map_guid") REFERENCES "public"."maps"("guid") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "match_rounds" ADD CONSTRAINT "match_rounds_winner_user_guid_users_guid_fk" FOREIGN KEY ("winner_user_guid") REFERENCES "public"."users"("guid") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "match_scores" ADD CONSTRAINT "match_scores_round_guid_match_rounds_guid_fk" FOREIGN KEY ("round_guid") REFERENCES "public"."match_rounds"("guid") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "match_scores" ADD CONSTRAINT "match_scores_user_guid_users_guid_fk" FOREIGN KEY ("user_guid") REFERENCES "public"."users"("guid") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "match_status_history" ADD CONSTRAINT "match_status_history_match_guid_matches_guid_fk" FOREIGN KEY ("match_guid") REFERENCES "public"."matches"("guid") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "match_status_history" ADD CONSTRAINT "match_status_history_actor_user_guid_users_guid_fk" FOREIGN KEY ("actor_user_guid") REFERENCES "public"."users"("guid") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "match_timers" ADD CONSTRAINT "match_timers_match_guid_matches_guid_fk" FOREIGN KEY ("match_guid") REFERENCES "public"."matches"("guid") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_queue_guid_queues_guid_fk" FOREIGN KEY ("queue_guid") REFERENCES "public"."queues"("guid") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_season_guid_seasons_guid_fk" FOREIGN KEY ("season_guid") REFERENCES "public"."seasons"("guid") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_pool_guid_season_pools_guid_fk" FOREIGN KEY ("pool_guid") REFERENCES "public"."season_pools"("guid") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_winner_user_guid_users_guid_fk" FOREIGN KEY ("winner_user_guid") REFERENCES "public"."users"("guid") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "queued_players" ADD CONSTRAINT "queued_players_queue_guid_queues_guid_fk" FOREIGN KEY ("queue_guid") REFERENCES "public"."queues"("guid") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "queued_players" ADD CONSTRAINT "queued_players_user_platform_fk" FOREIGN KEY ("user_guid","platform_id") REFERENCES "public"."users"("guid","platform_id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "queues" ADD CONSTRAINT "queues_pool_guid_season_pools_guid_fk" FOREIGN KEY ("pool_guid") REFERENCES "public"."season_pools"("guid") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "season_pools" ADD CONSTRAINT "season_pools_season_guid_seasons_guid_fk" FOREIGN KEY ("season_guid") REFERENCES "public"."seasons"("guid") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "match_map_actions_match_idx" ON "match_map_actions" USING btree ("match_guid","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "match_participants_competitor_role_unique_idx" ON "match_participants" USING btree ("match_guid","role") WHERE "match_participants"."role" <> 'spectator';--> statement-breakpoint
CREATE UNIQUE INDEX "match_participants_one_active_match_idx" ON "match_participants" USING btree ("user_guid") WHERE "match_participants"."active" = true AND "match_participants"."role" <> 'spectator';--> statement-breakpoint
CREATE INDEX "match_status_history_match_time_idx" ON "match_status_history" USING btree ("match_guid","created_at");--> statement-breakpoint
CREATE INDEX "match_timers_due_idx" ON "match_timers" USING btree ("status","due_at");--> statement-breakpoint
CREATE INDEX "oauth_states_expiry_idx" ON "oauth_states" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "queued_players_one_queue_per_user_idx" ON "queued_players" USING btree ("user_guid");--> statement-breakpoint
CREATE INDEX "queued_players_queue_joined_idx" ON "queued_players" USING btree ("queue_guid","joined_at");--> statement-breakpoint
CREATE UNIQUE INDEX "seasons_one_current_idx" ON "seasons" USING btree ("is_current") WHERE "seasons"."is_current" = true;--> statement-breakpoint
ALTER TABLE "seasons" ADD CONSTRAINT "seasons_no_overlap" EXCLUDE USING gist ("active_range" WITH &&);--> statement-breakpoint
CREATE OR REPLACE FUNCTION ensure_current_stats_for_user() RETURNS trigger AS $$
BEGIN
    INSERT INTO competitive_statistics (user_guid, season_guid)
    SELECT NEW.guid, guid FROM seasons
    WHERE is_current = true AND starts_at <= now() AND (ends_at IS NULL OR ends_at > now())
    ON CONFLICT (user_guid, season_guid) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER users_ensure_current_stats AFTER INSERT ON users FOR EACH ROW EXECUTE FUNCTION ensure_current_stats_for_user();--> statement-breakpoint
CREATE OR REPLACE FUNCTION ensure_stats_for_current_season() RETURNS trigger AS $$
BEGIN
    IF NEW.is_current = true THEN
        INSERT INTO competitive_statistics (user_guid, season_guid)
        SELECT guid, NEW.guid FROM users
        ON CONFLICT (user_guid, season_guid) DO NOTHING;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER seasons_ensure_current_stats AFTER INSERT OR UPDATE OF is_current ON seasons FOR EACH ROW EXECUTE FUNCTION ensure_stats_for_current_season();
