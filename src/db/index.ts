import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { getEnvironmentVariables } from "../env";
import * as schema from "./schema";

let database: ReturnType<typeof createDatabase> | undefined;

function createDatabase() {
    const env = getEnvironmentVariables();

    const pool = new Pool({
        user: env.POSTGRES_USER,
        password: env.POSTGRES_PASSWORD,
        database: env.POSTGRES_DB,
        host: env.POSTGRES_HOST,
        port: env.POSTGRES_PORT,
        ssl: env.POSTGRES_USE_SSL ? { rejectUnauthorized: false } : false,
    });

    return drizzle(pool, { schema });
}

export const getDatabase = () => {
    database ??= createDatabase();
    return database;
};
