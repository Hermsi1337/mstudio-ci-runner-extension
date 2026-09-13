import { defineConfig } from "drizzle-kit";
import { getEnvironmentVariables } from "../src/env";

const env = getEnvironmentVariables();

export default defineConfig({
    out: "./src/db/migrations",
    schema: "./src/db/schema.ts",
    dialect: "postgresql",
    dbCredentials: {
        host: env.POSTGRES_HOST,
        port: env.POSTGRES_PORT,
        user: env.POSTGRES_USER,
        password: env.POSTGRES_PASSWORD,
        database: env.POSTGRES_DB,
        ssl: env.POSTGRES_USE_SSL,
    },
});
