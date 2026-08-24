import "dotenv/config";
import postgres from "postgres";

const sqlClient = postgres(
	process.env.PGCONNECTSTRING ??
		"postgres://compcube:change-me@localhost:5432/compcube",
	{ max: 1 },
);

// Drizzle can describe the tstzrange column but it cannot currently describe an EXCLUDE constraint.
// This is kept next to schema.ts and can safely run more than once after db:push.
async function main(): Promise<void> {
	// Repair the early generated constraints which accidentally became [0-11] instead of [0-9].
	await sqlClient`ALTER TABLE users DROP CONSTRAINT IF EXISTS users_discord_id_format`;
	await sqlClient`ALTER TABLE users ADD CONSTRAINT users_discord_id_format CHECK (discord_id IS NULL OR discord_id ~ '^[[:digit:]]+$')`;
	await sqlClient`ALTER TABLE users DROP CONSTRAINT IF EXISTS users_platform_id_format`;
	await sqlClient`ALTER TABLE users ADD CONSTRAINT users_platform_id_format CHECK (platform_id IS NULL OR platform_id ~ '^[[:digit:]]+$')`;

	await sqlClient`DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'seasons_no_overlap') THEN
        ALTER TABLE seasons ADD CONSTRAINT seasons_no_overlap EXCLUDE USING gist (active_range WITH &&);
    END IF;
END $$`;

	// Every user receives current-season stats, including users who existed before a season became current.
	await sqlClient`CREATE OR REPLACE FUNCTION ensure_current_stats_for_user() RETURNS trigger AS $$
BEGIN
    INSERT INTO competitive_statistics (user_guid, season_guid, current_mmr, starting_mmr)
    SELECT NEW.guid, guid, starting_mmr, starting_mmr FROM seasons
    WHERE is_current = true AND starts_at <= now() AND (ends_at IS NULL OR ends_at > now())
    ON CONFLICT (user_guid, season_guid) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql`;
	await sqlClient`DROP TRIGGER IF EXISTS users_ensure_current_stats ON users`;
	await sqlClient`CREATE TRIGGER users_ensure_current_stats AFTER INSERT ON users FOR EACH ROW EXECUTE FUNCTION ensure_current_stats_for_user()`;

	await sqlClient`CREATE OR REPLACE FUNCTION ensure_stats_for_current_season() RETURNS trigger AS $$
BEGIN
    IF NEW.is_current = true THEN
        INSERT INTO competitive_statistics (user_guid, season_guid, current_mmr, starting_mmr)
        SELECT guid, NEW.guid, NEW.starting_mmr, NEW.starting_mmr FROM users
        ON CONFLICT (user_guid, season_guid) DO NOTHING;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql`;
	await sqlClient`DROP TRIGGER IF EXISTS seasons_ensure_current_stats ON seasons`;
	await sqlClient`CREATE TRIGGER seasons_ensure_current_stats AFTER INSERT OR UPDATE OF is_current ON seasons FOR EACH ROW EXECUTE FUNCTION ensure_stats_for_current_season()`;

	await sqlClient.end();
	console.log("Applied CompCube PostgreSQL constraints.");
}

void main().catch(async (error) => {
    console.error(error);
    await sqlClient.end();
    process.exitCode = 1;
});
