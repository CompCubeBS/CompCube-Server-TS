import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import { config } from "../src/config";

export const sqlClient = postgres(config.databaseUrl, { max: 10 });
export const db = drizzle(sqlClient, { schema, logger: false });

export async function closeDatabase(): Promise<void> {
    await sqlClient.end();
}
