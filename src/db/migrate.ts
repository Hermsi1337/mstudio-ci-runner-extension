import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { getEnvironmentVariables } from "../env";

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

        console.log("[migrations] Running database migrations...");
        await migrate(db, { migrationsFolder: "./src/db/migrations" });
        console.log("[migrations] Database migrations completed successfully");

        return { success: true };
    } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        console.error("[migrations] Database migration failed:", err.message);
        return { success: false, error: err };
    } finally {
        await pool.end();
    }
}
