import { readFile } from "node:fs/promises";
import type { StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { eq, sql } from "drizzle-orm";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startPostgres } from "../helpers/postgres.ts";

let postgres: StartedPostgreSqlContainer;
let db: Awaited<ReturnType<typeof import("@/db/index.ts")["getDatabase"]>>;
let schema: typeof import("@/db/schema.ts");

beforeAll(async () => {
    postgres = await startPostgres();
    schema = await import("@/db/schema.ts");
    db = (await import("@/db/index.ts")).getDatabase();
});

afterAll(async () => {
    await db?.$client.end();
    await postgres?.stop();
});

describe("database", () => {
    const instanceId = "11111111-1111-1111-1111-111111111111";

    it("applies the generated migrations", async () => {
        const tables = await db.execute(
            sql`select table_name from information_schema.tables where table_schema = 'public' order by table_name`,
        );
        const names = tables.rows.map((r) => r.table_name);
        expect(names).toContain("extension_instance");
        expect(names).toContain("runners");
    });

    it("stores the instance secret encrypted and reads it back in clear text", async () => {
        await db.insert(schema.extensionInstances).values({
            id: instanceId,
            contextId: "22222222-2222-2222-2222-222222222222",
            context: "project",
            active: true,
            consentedScopes: ["stack:read"],
            secret: "instance-secret",
        });
        const [instance] = await db
            .select()
            .from(schema.extensionInstances)
            .where(eq(schema.extensionInstances.id, instanceId));
        expect(instance.secret).toBe("instance-secret");

        const raw = await db.execute(
            sql`select "secret" from extension_instance where id = ${instanceId}`,
        );
        expect(raw.rows[0].secret).not.toBe("instance-secret");
    });

    it("keeps no provider secrets in the runners table", async () => {
        const columns = await db.execute(
            sql`select column_name from information_schema.columns where table_name = 'runners'`,
        );
        const names = columns.rows.map((row) => row.column_name);
        expect(names).not.toContain("credentials");
        await db.insert(schema.runners).values({
            id: "33333333-3333-3333-3333-333333333333",
            extensionInstanceId: instanceId,
            projectId: "22222222-2222-2222-2222-222222222222",
            stackId: "44444444-4444-4444-4444-444444444444",
            provider: "github",
            name: "ci",
            runnerName: "ci",
            target: "acme/app",
            targetUrl: "https://github.com/acme/app",
            labels: "mittwald",
            createdBy: "55555555-5555-5555-5555-555555555555",
        });
    });

    it("deletes runners when the extension instance is removed", async () => {
        await db
            .delete(schema.extensionInstances)
            .where(eq(schema.extensionInstances.id, instanceId));
        const rows = await db
            .select()
            .from(schema.runners)
            .where(eq(schema.runners.extensionInstanceId, instanceId));
        expect(rows).toHaveLength(0);
    });
});

/**
 * Runs the migrations up to 0003 in a separate database, inserts rows the way
 * older releases wrote them and checks that 0004 fills runnerName like
 * createRunner would have.
 */
describe("migration 0004_add_runner_name", () => {
    const migrationsDir = "src/db/migrations";
    let legacy: Client;

    const apply = async (tag: string) => {
        const content = await readFile(`${migrationsDir}/${tag}.sql`, "utf8");
        for (const statement of content.split("--> statement-breakpoint")) {
            await legacy.query(statement);
        }
    };

    beforeAll(async () => {
        await db.execute(sql`create database legacy`);
        legacy = new Client({
            host: postgres.getHost(),
            port: postgres.getPort(),
            user: postgres.getUsername(),
            password: postgres.getPassword(),
            database: "legacy",
        });
        await legacy.connect();
    });

    afterAll(async () => {
        await legacy?.end();
    });

    it("backfills runnerName with the slug of the name or the service name", async () => {
        for (const tag of [
            "0000_initial",
            "0001_drop_runner_credentials",
            "0002_add_image_builds",
            "0003_add_docker_api",
        ]) {
            await apply(tag);
        }
        await legacy.query(
            `insert into extension_instance (id, "contextId", active, consented_scopes)
             values ('instance', 'project', true, '{}')`,
        );
        const longName = "Deploy Runner For The Production Cluster 2026 xyzw";
        const legacyRows = [
            { name: "Build", serviceName: "runner-build" },
            { name: "İstanbul", serviceName: "runner-i-stanbul" },
            { name: "\u212Aelvin", serviceName: "runner-kelvin" },
            { name: longName, serviceName: "runner-deploy" },
            { name: "!!!", serviceName: "runner-runner-ab12cd34" },
        ];
        for (const [index, row] of legacyRows.entries()) {
            await legacy.query(
                `insert into runners (id, "extensionInstanceId", "projectId", "stackId",
                 "serviceName", provider, name, target, "targetUrl", labels, "createdBy")
                 values ($1, 'instance', 'project', 'stack', $2, 'github', $3,
                 'acme/app', 'https://github.com/acme/app', 'mittwald', 'user')`,
                [String(index), row.serviceName, row.name],
            );
        }

        await apply("0004_add_runner_name");

        const { slugify } = await import("@/domain/runner.ts");
        const { rows } = await legacy.query<{ runnerName: string }>(
            `select "runnerName" from runners order by id`,
        );
        expect(rows.map((row) => row.runnerName)).toEqual([
            ...legacyRows.slice(0, 4).map((row) => slugify(row.name)),
            "runner-ab12cd34",
        ]);
        expect(longName).toHaveLength(50);
        expect(rows.map((row) => row.runnerName).slice(1, 4)).toEqual([
            "i-stanbul",
            "kelvin",
            "deploy-runner-for-the-production-cluster",
        ]);
    });
});
