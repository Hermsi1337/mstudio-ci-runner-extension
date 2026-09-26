import {
    buildEncryptedTextColumn,
    buildEncryptionKey,
} from "@weissaufschwarz/mitthooks-drizzle/encryption";
import { buildExtensionInstanceTable } from "@weissaufschwarz/mitthooks-drizzle/schema";
import {
    boolean,
    integer,
    real,
    text,
    timestamp,
    unique,
    varchar,
} from "drizzle-orm/pg-core";
import { pgTable } from "drizzle-orm/pg-core/table";
import { getEnvironmentVariables } from "../env";

const env = getEnvironmentVariables();

export { context } from "@weissaufschwarz/mitthooks-drizzle/schema";

const encryptedText = buildEncryptedTextColumn(
    buildEncryptionKey(env.ENCRYPTION_MASTER_PASSWORD, env.ENCRYPTION_SALT),
);

export const extensionInstances = buildExtensionInstanceTable(encryptedText);

/**
 * One container stack per registration target and extension instance. Every
 * runner of that target is a service inside it, so the stack list in mStudio
 * mirrors the repositories, organizations and GitLab instances.
 */
export const runnerStacks = pgTable(
    "runner_stacks",
    {
        stackId: varchar({ length: 36 }).primaryKey(),
        extensionInstanceId: varchar({ length: 36 })
            .notNull()
            .references(() => extensionInstances.id, { onDelete: "cascade" }),
        projectId: varchar({ length: 36 }).notNull(),
        targetUrl: text().notNull(),
        createdAt: timestamp().defaultNow().notNull(),
    },
    (table) => [unique().on(table.extensionInstanceId, table.targetUrl)],
);

export type RunnerStackRow = typeof runnerStacks.$inferSelect;

export const runners = pgTable("runners", {
    id: varchar({ length: 36 }).primaryKey(),
    extensionInstanceId: varchar({ length: 36 })
        .notNull()
        .references(() => extensionInstances.id, { onDelete: "cascade" }),
    projectId: varchar({ length: 36 }).notNull(),
    stackId: varchar({ length: 36 }).notNull(),
    serviceName: varchar({ length: 63 }).notNull().default("runner"),
    serviceId: varchar({ length: 64 }),
    provider: varchar({ length: 32 }).notNull(),
    name: varchar({ length: 64 }).notNull(),
    target: text().notNull(),
    targetUrl: text().notNull(),
    labels: text().notNull(),
    ephemeral: boolean().notNull().default(false),
    tokenType: varchar({ length: 16 }).notNull().default("registration"),
    size: varchar({ length: 16 }).notNull().default("medium"),
    cpus: real(),
    memoryMb: integer(),
    image: text(),
    runnerVersion: varchar({ length: 32 }),
    cache: boolean().notNull().default(false),
    cacheSizeGb: integer().notNull().default(10),
    imageBuilds: boolean().notNull().default(false),
    dockerApi: boolean().notNull().default(false),
    concurrency: integer().notNull().default(1),
    cronjobIds: text().notNull().default("[]"),
    createdBy: varchar({ length: 36 }).notNull(),
    createdAt: timestamp().defaultNow().notNull(),
});

export type RunnerRow = typeof runners.$inferSelect;
export type NewRunnerRow = typeof runners.$inferInsert;

/**
 * One row per stack that runs the service `docker` (docs/docker-api.md), with
 * the SHA-256 of the secret the service trades for tokens.
 */
export const dockerApiStacks = pgTable("docker_api_stacks", {
    stackId: varchar({ length: 36 }).primaryKey(),
    extensionInstanceId: varchar({ length: 36 })
        .notNull()
        .references(() => extensionInstances.id, { onDelete: "cascade" }),
    projectId: varchar({ length: 36 }).notNull(),
    secretHash: varchar({ length: 64 }).notNull(),
    createdAt: timestamp().defaultNow().notNull(),
});

export type DockerApiStackRow = typeof dockerApiStacks.$inferSelect;
