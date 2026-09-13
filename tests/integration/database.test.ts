import type { StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { eq, sql } from "drizzle-orm";
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

    it("stores provider credentials encrypted and reads them back in clear text", async () => {
        await db.insert(schema.extensionInstances).values({
            id: instanceId,
            contextId: "22222222-2222-2222-2222-222222222222",
            context: "project",
            active: true,
            consentedScopes: ["stack:read"],
            secret: "instance-secret",
        });
        await db.insert(schema.runners).values({
            id: "33333333-3333-3333-3333-333333333333",
            extensionInstanceId: instanceId,
            projectId: "22222222-2222-2222-2222-222222222222",
            stackId: "44444444-4444-4444-4444-444444444444",
            provider: "github",
            name: "ci",
            target: "acme/app",
            targetUrl: "https://github.com/acme/app",
            credentials: JSON.stringify({ token: "github_pat_secret" }),
            labels: "mittwald",
            createdBy: "55555555-5555-5555-5555-555555555555",
        });

        const [row] = await db
            .select()
            .from(schema.runners)
            .where(eq(schema.runners.extensionInstanceId, instanceId));
        expect(JSON.parse(row.credentials)).toEqual({
            token: "github_pat_secret",
        });

        const raw = await db.execute(
            sql`select "credentials" as token from runners where id = ${row.id}`,
        );
        expect(raw.rows[0].token).not.toBe("github_pat_secret");
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
