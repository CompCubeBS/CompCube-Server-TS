CREATE TYPE "public"."moderation_action" AS ENUM('timeout', 'ban');--> statement-breakpoint
CREATE TABLE "match_audit_events" (
	"guid" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"match_guid" uuid NOT NULL,
	"user_guid" uuid,
	"timer_guid" uuid,
	"event_type" varchar(64) NOT NULL,
	"source" varchar(16) NOT NULL,
	"timer_expired" boolean DEFAULT false NOT NULL,
	"elapsed_ms" integer,
	"remaining_ms" integer,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "match_audit_events_type" CHECK ("match_audit_events"."event_type" IN ('initial_hand_dealt', 'discards_submitted', 'replacement_maps_dealt', 'map_picked', 'score_submitted', 'score_defaulted')),
	CONSTRAINT "match_audit_events_source" CHECK ("match_audit_events"."source" IN ('player', 'server')),
	CONSTRAINT "match_audit_events_timing_nonnegative" CHECK (("match_audit_events"."elapsed_ms" IS NULL OR "match_audit_events"."elapsed_ms" >= 0) AND ("match_audit_events"."remaining_ms" IS NULL OR "match_audit_events"."remaining_ms" >= 0))
);
--> statement-breakpoint
CREATE TABLE "mock_clients" (
	"guid" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_guid" uuid NOT NULL,
	"impersonated_user_guid" uuid NOT NULL,
	"match_guid" uuid,
	"connected" boolean DEFAULT true NOT NULL,
	"last_action" varchar(80),
	"last_action_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mock_clients_owner_impersonation_match_unique" UNIQUE("owner_user_guid","impersonated_user_guid","match_guid"),
	CONSTRAINT "mock_clients_expiry_order" CHECK ("mock_clients"."expires_at" > "mock_clients"."created_at")
);
--> statement-breakpoint
CREATE TABLE "user_moderation_actions" (
	"guid" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_guid" uuid NOT NULL,
	"moderator_user_guid" uuid,
	"action" "moderation_action" NOT NULL,
	"reason" text NOT NULL,
	"disconnect_penalty" boolean DEFAULT false NOT NULL,
	"starts_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ends_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"revoked_by_user_guid" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_moderation_actions_time_order" CHECK ("user_moderation_actions"."ends_at" IS NULL OR "user_moderation_actions"."ends_at" > "user_moderation_actions"."starts_at"),
	CONSTRAINT "user_moderation_actions_timeout_has_end" CHECK ("user_moderation_actions"."action" <> 'timeout' OR "user_moderation_actions"."ends_at" IS NOT NULL),
	CONSTRAINT "user_moderation_actions_disconnect_is_timeout" CHECK (NOT "user_moderation_actions"."disconnect_penalty" OR "user_moderation_actions"."action" = 'timeout'),
	CONSTRAINT "user_moderation_actions_revoke_order" CHECK ("user_moderation_actions"."revoked_at" IS NULL OR "user_moderation_actions"."revoked_at" >= "user_moderation_actions"."starts_at")
);
--> statement-breakpoint
ALTER TABLE "match_scores" DROP CONSTRAINT "match_scores_values_nonnegative";--> statement-breakpoint
ALTER TABLE "match_scores" DROP CONSTRAINT "match_scores_accuracy_consistency";--> statement-breakpoint
ALTER TABLE "match_scores" DROP CONSTRAINT "match_scores_timeout_consistency";--> statement-breakpoint
ALTER TABLE "users" DROP CONSTRAINT "users_discord_id_format";--> statement-breakpoint
ALTER TABLE "users" DROP CONSTRAINT "users_platform_id_format";--> statement-breakpoint
ALTER TABLE "match_scores" ADD COLUMN "raw_score" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "match_scores" ADD COLUMN "client_reported_modified_score" integer;--> statement-breakpoint
ALTER TABLE "match_scores" ADD COLUMN "no_fail_triggered" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "is_mock" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "mock_owner_user_guid" uuid;--> statement-breakpoint
ALTER TABLE "match_audit_events" ADD CONSTRAINT "match_audit_events_match_guid_matches_guid_fk" FOREIGN KEY ("match_guid") REFERENCES "public"."matches"("guid") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "match_audit_events" ADD CONSTRAINT "match_audit_events_user_guid_users_guid_fk" FOREIGN KEY ("user_guid") REFERENCES "public"."users"("guid") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "match_audit_events" ADD CONSTRAINT "match_audit_events_timer_guid_match_timers_guid_fk" FOREIGN KEY ("timer_guid") REFERENCES "public"."match_timers"("guid") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "mock_clients" ADD CONSTRAINT "mock_clients_owner_user_guid_users_guid_fk" FOREIGN KEY ("owner_user_guid") REFERENCES "public"."users"("guid") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "mock_clients" ADD CONSTRAINT "mock_clients_impersonated_user_guid_users_guid_fk" FOREIGN KEY ("impersonated_user_guid") REFERENCES "public"."users"("guid") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "mock_clients" ADD CONSTRAINT "mock_clients_match_guid_matches_guid_fk" FOREIGN KEY ("match_guid") REFERENCES "public"."matches"("guid") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "user_moderation_actions" ADD CONSTRAINT "user_moderation_actions_user_guid_users_guid_fk" FOREIGN KEY ("user_guid") REFERENCES "public"."users"("guid") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "user_moderation_actions" ADD CONSTRAINT "user_moderation_actions_moderator_user_guid_users_guid_fk" FOREIGN KEY ("moderator_user_guid") REFERENCES "public"."users"("guid") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "user_moderation_actions" ADD CONSTRAINT "user_moderation_actions_revoked_by_user_guid_users_guid_fk" FOREIGN KEY ("revoked_by_user_guid") REFERENCES "public"."users"("guid") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "match_audit_events_match_time_idx" ON "match_audit_events" USING btree ("match_guid","created_at");--> statement-breakpoint
CREATE INDEX "mock_clients_match_idx" ON "mock_clients" USING btree ("match_guid");--> statement-breakpoint
CREATE INDEX "user_moderation_actions_user_time_idx" ON "user_moderation_actions" USING btree ("user_guid","starts_at","ends_at");--> statement-breakpoint
CREATE INDEX "user_moderation_actions_disconnect_penalty_idx" ON "user_moderation_actions" USING btree ("user_guid","disconnect_penalty","starts_at");--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_mock_owner_user_guid_users_guid_fk" FOREIGN KEY ("mock_owner_user_guid") REFERENCES "public"."users"("guid") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "match_scores" ADD CONSTRAINT "match_scores_raw_within_max" CHECK ("match_scores"."raw_score" <= "match_scores"."max_score");--> statement-breakpoint
ALTER TABLE "match_scores" ADD CONSTRAINT "match_scores_values_nonnegative" CHECK ("match_scores"."raw_score" >= 0 AND "match_scores"."modified_score" >= 0 AND ("match_scores"."client_reported_modified_score" IS NULL OR "match_scores"."client_reported_modified_score" >= 0) AND "match_scores"."max_score" > 0 AND "match_scores"."miss_count" >= 0);--> statement-breakpoint
ALTER TABLE "match_scores" ADD CONSTRAINT "match_scores_accuracy_consistency" CHECK (abs("match_scores"."accuracy" - ("match_scores"."raw_score"::double precision / "match_scores"."max_score")) < 0.000000001);--> statement-breakpoint
ALTER TABLE "match_scores" ADD CONSTRAINT "match_scores_timeout_consistency" CHECK (NOT "match_scores"."timed_out" OR ("match_scores"."raw_score" = 0 AND "match_scores"."modified_score" = 0 AND "match_scores"."accuracy" = 0 AND NOT "match_scores"."full_combo" AND "match_scores"."submitted_at" IS NULL));--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_mock_not_competitive" CHECK (NOT "matches"."is_mock" OR NOT "matches"."competitive");--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_mock_has_owner" CHECK (NOT "matches"."is_mock" OR "matches"."mock_owner_user_guid" IS NOT NULL);--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_discord_id_format" CHECK ("users"."discord_id" IS NULL OR "users"."discord_id" ~ '^[[:digit:]]+$');--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_platform_id_format" CHECK ("users"."platform_id" IS NULL OR "users"."platform_id" ~ '^[[:digit:]]+$');