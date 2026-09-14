import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { getEnvironmentVariables } from "../env";
import { createLogger } from "../logger";

const log = createLogger("db");

export interface MigrationResult {
    success: boolean;
    error?: Error;
}

export async function runMigrations(): Promise<MigrationResult> {
    const env = getEnvironmentVariables();

    const pool = new Pool({
        user: env.POSTGRES_USER,
        password: env.POSTGRES_PASSWORD,
        database: env.POSTGRES_DB,
        host: env.POSTGRES_HOST,
        port: env.POSTGRES_PORT,
        ssl: env.POSTGRES_USE_SSL ? { rejectUnauthorized: false } : false,
        connectionTimeoutMillis: 10000,
    });

    try {
        const client = await pool.connect();
        client.release();

        const db = drizzle(pool);

        log.info("running migrations", {
            host: env.POSTGRES_HOST,
            database: env.POSTGRES_DB,
        });
        await migrate(db, { migrationsFolder: "./src/db/migrations" });
        log.info("migrations complete");

        return { success: true };
    } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        log.error("migrations failed", { error: err });
        return { success: false, error: err };
    } finally {
        await pool.end();
    }
}
