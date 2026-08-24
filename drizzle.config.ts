import "dotenv/config";
import { defineConfig } from "drizzle-kit";
export default defineConfig({
    out: "./drizzle",
    schema: "./db/schema.ts",
    dialect: "postgresql",
    dbCredentials: {
        url: process.env.PGCONNECTSTRING ?? "postgres://compcube:compcube@localhost:5432/compcube",
    },
});
