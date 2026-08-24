ALTER TYPE "public"."match_outcome_kind" ADD VALUE 'draw' BEFORE 'aborted';--> statement-breakpoint
ALTER TYPE "public"."permission" ADD VALUE 'perk:contributor';--> statement-breakpoint
ALTER TABLE "match_scores" ALTER COLUMN "submitted_at" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "match_scores" ALTER COLUMN "submitted_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "queues" ALTER COLUMN "pool_guid" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "maps" ADD COLUMN "duration_seconds" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "maps" ADD COLUMN "max_score" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "match_hands" ADD COLUMN "discarded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "match_rounds" ADD COLUMN "score_submission_due_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "match_scores" ADD COLUMN "timed_out" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "competitive" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "maps" ADD CONSTRAINT "maps_duration_positive" CHECK ("maps"."duration_seconds" > 0);--> statement-breakpoint
ALTER TABLE "maps" ADD CONSTRAINT "maps_max_score_positive" CHECK ("maps"."max_score" > 0);--> statement-breakpoint
ALTER TABLE "maps" ADD CONSTRAINT "maps_one_speed_modifier" CHECK ((
        (array_position("maps"."modifiers", 'SS'::map_modifiers_abbr) IS NOT NULL)::integer
        + (array_position("maps"."modifiers", 'FS'::map_modifiers_abbr) IS NOT NULL)::integer
        + (array_position("maps"."modifiers", 'SFS'::map_modifiers_abbr) IS NOT NULL)::integer
    ) <= 1);--> statement-breakpoint
ALTER TABLE "match_rounds" ADD CONSTRAINT "match_rounds_score_deadline_order" CHECK ("match_rounds"."score_submission_due_at" IS NULL OR "match_rounds"."score_submission_due_at" >= "match_rounds"."started_at");--> statement-breakpoint
ALTER TABLE "match_scores" ADD CONSTRAINT "match_scores_timeout_consistency" CHECK (NOT "match_scores"."timed_out" OR ("match_scores"."modified_score" = 0 AND "match_scores"."accuracy" = 0 AND NOT "match_scores"."full_combo" AND "match_scores"."submitted_at" IS NULL));