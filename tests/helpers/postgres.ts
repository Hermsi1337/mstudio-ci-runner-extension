import {
    PostgreSqlContainer,
    type StartedPostgreSqlContainer,
} from "@testcontainers/postgresql";
import { setTestEnvironment } from "./env.ts";

export async function startPostgres(): Promise<StartedPostgreSqlContainer> {
    const container = await new PostgreSqlContainer("postgres:16-alpine")
        .withDatabase("extension")
        .withUsername("extension")
        .withPassword("extension")
        .start();

    setTestEnvironment({
        POSTGRES_HOST: container.getHost(),
        POSTGRES_PORT: String(container.getPort()),
        POSTGRES_USER: container.getUsername(),
        POSTGRES_PASSWORD: container.getPassword(),
        POSTGRES_DB: container.getDatabase(),
    });

    const { runMigrations } = await import("@/db/migrate.ts");
    const result = await runMigrations();
    if (!result.success) {
        throw result.error;
    }
    return container;
}
