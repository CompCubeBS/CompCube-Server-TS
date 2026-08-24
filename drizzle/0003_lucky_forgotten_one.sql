ALTER TABLE "users" DROP CONSTRAINT "users_discord_id_format";--> statement-breakpoint
ALTER TABLE "users" DROP CONSTRAINT "users_platform_id_format";--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_discord_id_format" CHECK ("users"."discord_id" IS NULL OR "users"."discord_id" ~ '^[[:digit:]]+$');--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_platform_id_format" CHECK ("users"."platform_id" IS NULL OR "users"."platform_id" ~ '^[[:digit:]]+$');
