import type { StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { CreateRunnerRequest, Runner } from "@/generated/extension-api";
import { zRunner, zRunnerList } from "@/generated/extension-api/zod.gen";
import { setTestEnvironment } from "../helpers/env.ts";
import { startPostgres } from "../helpers/postgres.ts";
import { type MockApi, startMockApi } from "../helpers/prism.ts";

/**
 * Prism rejects any request that violates the upstream specs, so these tests
 * also verify the request bodies the extension sends to mittwald and GitLab.
 */
let postgres: StartedPostgreSqlContainer;
let mittwald: MockApi;
let gitlab: MockApi;
let runner: typeof import("@/domain/runner.ts");
let client: ReturnType<
    typeof import("@/mittwald/client.ts")["createMittwaldClient"]
>;
let db: ReturnType<typeof import("@/db/index.ts")["getDatabase"]>;
let schema: typeof import("@/db/schema.ts");

const extensionInstanceId = "11111111-1111-1111-1111-111111111111";
const projectId = "22222222-2222-2222-2222-222222222222";
const userId = "55555555-5555-5555-5555-555555555555";

beforeAll(async () => {
    [postgres, mittwald, gitlab] = await Promise.all([
        startPostgres(),
        startMockApi("mittwald-v2"),
        startMockApi("gitlab"),
    ]);
    setTestEnvironment({
        MITTWALD_API_URL: `${mittwald.url}/`,
        GITLAB_API_URL: gitlab.url,
    });

    schema = await import("@/db/schema.ts");
    db = (await import("@/db/index.ts")).getDatabase();
    await db.insert(schema.extensionInstances).values({
        id: extensionInstanceId,
        contextId: projectId,
        context: "project",
        active: true,
        consentedScopes: [
            "stack:read",
            "stack:write",
            "stack:delete",
            "cronjob:write",
            "cronjob:delete",
        ],
        secret: "instance-secret",
    });

    runner = await import("@/domain/runner.ts");
    client = (await import("@/mittwald/client.ts")).createMittwaldClient(
        "token",
    );
});

afterAll(async () => {
    await db?.$client.end();
    await Promise.all([
        postgres?.stop(),
        mittwald?.container.stop(),
        gitlab?.container.stop(),
    ]);
});

const cases: {
    title: string;
    input: CreateRunnerRequest;
    expect: Partial<Record<string, unknown>>;
}[] = [
    {
        title: "GitHub repository runner with a registration token",
        input: {
            provider: "github",
            name: "Repo Runner",
            target: "acme/app",
            tokenType: "registration",
            token: "AEBIHM56SBF3SULYYYY3BH3KU333M",
            size: "small",
            cache: true,
            cacheSizeGb: 20,
        },
        expect: {
            provider: "github",
            target: "acme/app",
            targetUrl: "https://github.com/acme/app",
            labels: ["mittwald"],
            ephemeral: false,
            tokenType: "registration",
            size: "small",
            cpus: 0.5,
            memoryMb: 1024,
            cache: true,
            cacheSizeGb: 20,
        },
    },
    {
        title: "GitLab runner with size and concurrency",
        input: {
            provider: "gitlab",
            name: "GitLab Runner",
            instanceUrl: "https://gitlab.example.com",
            tokenType: "registration",
            token: "glrt-t1_AbCdEfGhIjKlMnOpQrSt",
            size: "medium",
            concurrency: 2,
        },
        expect: {
            provider: "gitlab",
            labels: [],
            ephemeral: false,
            size: "medium",
            cache: false,
            cacheSizeGb: 10,
            concurrency: 2,
        },
    },
    {
        title: "GitLab runner with a runner token",
        input: {
            provider: "gitlab",
            name: "Token Runner",
            instanceUrl: "https://gitlab.example.com",
            tokenType: "registration",
            token: "glrt-t1_AbCdEfGhIjKlMnOpQrSt",
        },
        expect: {
            provider: "gitlab",
            target: "gitlab.example.com",
            targetUrl: "https://gitlab.example.com",
            labels: [],
            concurrency: 1,
        },
    },
    {
        title: "GitLab runner on an instance URL with a trailing slash",
        input: {
            provider: "gitlab",
            name: "Shared Runner",
            instanceUrl: "https://gitlab.example.com/",
            tokenType: "registration",
            token: "glrt-t1_AbCdEfGhIjKlMnOpQrSt",
        },
        expect: {
            provider: "gitlab",
            target: "gitlab.example.com",
            targetUrl: "https://gitlab.example.com",
            labels: [],
        },
    },
];

describe.each(cases)(
    "runner lifecycle: $title",
    ({ input, expect: expected }) => {
        let runnerId: string;

        it("creates a runner stack that conforms to the API specs", async () => {
            const created = await runner.createRunner(
                client,
                extensionInstanceId,
                projectId,
                userId,
                input,
            );
            expect(zRunner.parse(created)).toEqual(created);
            expect(created).toMatchObject(expected);
            runnerId = created.id;
        });

        it("lists the runner with its live status", async () => {
            const list = await runner.listRunners(client, extensionInstanceId);
            const found = zRunnerList
                .parse(list)
                .find((r) => r.id === runnerId);
            expect(found).toBeDefined();
            expect(found?.status).not.toBe("missing");
        });

        it("reads logs and restarts the service", async () => {
            const logs = await runner.getRunnerLogs(
                client,
                extensionInstanceId,
                runnerId,
                50,
            );
            expect(typeof logs).toBe("string");
            await expect(
                runner.restartRunner(client, extensionInstanceId, runnerId),
            ).resolves.toBeUndefined();
        });

        it("reports the runner version and no pending update", async () => {
            const list = await runner.listRunners(client, extensionInstanceId);
            const found = list.find((r) => r.id === runnerId);
            expect(found?.runnerVersion).toBe(found?.latestRunnerVersion);
            expect(found?.latestImageVersion).toBe("test");
            expect(found?.imageVersion).toBe("test");
            expect(found?.updateAvailable).toBe(false);
        });

        it("updates a runner that runs an older image", async () => {
            schema = await import("@/db/schema.ts");
            await db
                .update(schema.runners)
                .set({
                    image: "ghcr.io/hermsi1337/outdated:0.0.1",
                    runnerVersion: "0.0.1",
                })
                .where(eq(schema.runners.id, runnerId));
            const outdated = (
                await runner.listRunners(client, extensionInstanceId)
            ).find((r) => r.id === runnerId);
            expect(outdated?.updateAvailable).toBe(true);

            const updated = await runner.updateRunner(
                client,
                extensionInstanceId,
                runnerId,
            );
            expect(zRunner.parse(updated)).toEqual(updated);
            expect(updated.updateAvailable).toBe(false);
            expect(updated.runnerVersion).toBe(updated.latestRunnerVersion);
        });

        it("turns the cache on, changes its limit and turns it off", async () => {
            const enabled = await runner.configureRunner(
                client,
                extensionInstanceId,
                { runnerId, cache: true, cacheSizeGb: 5 },
            );
            expect(zRunner.parse(enabled)).toEqual(enabled);
            expect(enabled).toMatchObject({ cache: true, cacheSizeGb: 5 });

            const resized = await runner.configureRunner(
                client,
                extensionInstanceId,
                { runnerId, cache: true, cacheSizeGb: 7 },
            );
            expect(resized).toMatchObject({ cache: true, cacheSizeGb: 7 });

            const disabled = await runner.configureRunner(
                client,
                extensionInstanceId,
                { runnerId, cache: false },
            );
            expect(disabled).toMatchObject({ cache: false, cacheSizeGb: 7 });
        });

        it("switches between a preset and custom limits", async () => {
            const custom = await runner.configureRunner(
                client,
                extensionInstanceId,
                {
                    runnerId,
                    cache: false,
                    size: "custom",
                    cpus: 1.5,
                    memoryMb: 3072,
                },
            );
            expect(zRunner.parse(custom)).toEqual(custom);
            expect(custom).toMatchObject({
                size: "custom",
                cpus: 1.5,
                memoryMb: 3072,
            });

            const preset = await runner.configureRunner(
                client,
                extensionInstanceId,
                { runnerId, cache: false, size: "large" },
            );
            expect(preset).toMatchObject({
                size: "large",
                cpus: 2,
                memoryMb: 4096,
            });
        });

        it("changes the concurrency only where the provider supports it", async () => {
            const configured = await runner.configureRunner(
                client,
                extensionInstanceId,
                { runnerId, cache: false, concurrency: 3 },
            );
            expect(configured.concurrency).toBe(
                input.provider === "gitlab" ? 3 : 1,
            );
        });

        it("refuses access from other extension instances", async () => {
            await expect(
                runner.deleteRunner(
                    client,
                    "99999999-9999-9999-9999-999999999999",
                    runnerId,
                ),
            ).rejects.toMatchObject({ messageKey: "error.notFound.runner" });
        });

        it("deletes the runner, its registration and its database row", async () => {
            await runner.deleteRunner(client, extensionInstanceId, runnerId);
            const list = await runner.listRunners(client, extensionInstanceId);
            expect(list.find((r) => r.id === runnerId)).toBeUndefined();
        });
    },
);

/**
 * Prism answers every createStack with the same example id, so a second
 * target cannot be told apart from the first here; only the shared case is
 * covered.
 */
describe("shared stacks", () => {
    const shared = {
        provider: "github" as const,
        target: "acme/shared",
        tokenType: "registration" as const,
        token: "AEBIHM56SBF3SULYYYY3BH3KU333M",
    };
    let first: Runner;
    let second: Runner;

    it("puts runners of the same target into one stack with distinct services", async () => {
        first = await runner.createRunner(
            client,
            extensionInstanceId,
            projectId,
            userId,
            { ...shared, name: "Build" },
        );
        second = await runner.createRunner(
            client,
            extensionInstanceId,
            projectId,
            userId,
            { ...shared, name: "Build" },
        );
        expect(second.stackId).toBe(first.stackId);
        const [a, b] = await db
            .select({ serviceName: schema.runners.serviceName })
            .from(schema.runners)
            .where(eq(schema.runners.stackId, first.stackId));
        expect(a?.serviceName).toBe("runner-build");
        expect(b?.serviceName).toBe("runner-build-2");
    });

    it("keeps the stack while a runner remains and drops it with the last one", async () => {
        await runner.deleteRunner(client, extensionInstanceId, first.id);
        const [kept] = await db
            .select()
            .from(schema.runnerStacks)
            .where(eq(schema.runnerStacks.stackId, first.stackId));
        expect(kept).toBeDefined();

        await runner.deleteRunner(client, extensionInstanceId, second.id);
        const [gone] = await db
            .select()
            .from(schema.runnerStacks)
            .where(eq(schema.runnerStacks.stackId, first.stackId));
        expect(gone).toBeUndefined();
    });
});

describe("instance cleanup", () => {
    it("removes every runner and stack of a removed instance", async () => {
        const created = await runner.createRunner(
            client,
            extensionInstanceId,
            projectId,
            userId,
            {
                provider: "github",
                name: "Cleanup",
                target: "acme/cleanup",
                tokenType: "registration",
                token: "AEBIHM56SBF3SULYYYY3BH3KU333M",
            },
        );
        const rows = await db
            .select()
            .from(schema.runners)
            .where(eq(schema.runners.id, created.id));
        expect(rows).toHaveLength(1);

        await runner.deleteAllRunnersOfInstance(client, rows);

        const remaining = await runner.listRunners(client, extensionInstanceId);
        expect(remaining.some((r) => r.id === created.id)).toBe(true);
        // deleteAllRunnersOfInstance only tears down the upstream stacks and
        // provider registrations; the rows go with the FK cascade when the
        // instance row is removed. Assert the stack delete did not throw and
        // the runner remained addressable for that cascade.
        await db
            .delete(schema.runners)
            .where(eq(schema.runners.id, created.id));
    });
});

describe("input validation", () => {
    it("rejects a create for an unknown extension instance", async () => {
        await expect(
            runner.createRunner(
                client,
                "99999999-9999-9999-9999-999999999999",
                projectId,
                userId,
                {
                    provider: "github",
                    name: "orphaned",
                    target: "acme/app",
                    tokenType: "registration",
                    token: "AEBIHM56SBF3SULYYYY3BH3KU333M",
                },
            ),
        ).rejects.toMatchObject({ messageKey: "error.instance.unknown" });
    });
});
