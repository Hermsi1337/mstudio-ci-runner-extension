import type { StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { CreateRunnerRequest } from "@/generated/extension-api";
import { zRunner, zRunnerList } from "@/generated/extension-api/zod.gen";
import { setTestEnvironment } from "../helpers/env.ts";
import { startPostgres } from "../helpers/postgres.ts";
import { type MockApi, startMockApi } from "../helpers/prism.ts";

/**
 * Prism rejects any request that violates the upstream specs, so these tests
 * also verify the request bodies the extension sends to mittwald, GitHub and GitLab.
 */
let postgres: StartedPostgreSqlContainer;
let mittwald: MockApi;
let github: MockApi;
let gitlab: MockApi;
let runner: typeof import("@/domain/runner.ts");
let client: ReturnType<
    typeof import("@/mittwald/client.ts")["createMittwaldClient"]
>;
let db: ReturnType<typeof import("@/db/index.ts")["getDatabase"]>;

const extensionInstanceId = "11111111-1111-1111-1111-111111111111";
const projectId = "22222222-2222-2222-2222-222222222222";
const userId = "55555555-5555-5555-5555-555555555555";

beforeAll(async () => {
    [postgres, mittwald, github, gitlab] = await Promise.all([
        startPostgres(),
        startMockApi("mittwald-v2"),
        startMockApi("github"),
        startMockApi("gitlab"),
    ]);
    setTestEnvironment({
        MITTWALD_API_URL: `${mittwald.url}/`,
        GITHUB_API_URL: github.url,
        GITLAB_API_URL: gitlab.url,
    });

    const schema = await import("@/db/schema.ts");
    db = (await import("@/db/index.ts")).getDatabase();
    await db.insert(schema.extensionInstances).values({
        id: extensionInstanceId,
        contextId: projectId,
        context: "project",
        active: true,
        consentedScopes: ["stack:read", "stack:write", "stack:delete"],
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
        github?.container.stop(),
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
        },
        expect: {
            provider: "github",
            target: "acme/app",
            targetUrl: "https://github.com/acme/app",
            labels: ["mittwald"],
            ephemeral: false,
            size: "small",
        },
    },
    {
        title: "GitHub organization runner with a PAT",
        input: {
            provider: "github",
            name: "CI Runner",
            target: "acme",
            tokenType: "pat",
            token: "github_pat_0123456789",
            labels: "mittwald, ci",
            ephemeral: true,
            size: "small",
        },
        expect: {
            provider: "github",
            target: "acme",
            targetUrl: "https://github.com/acme",
            labels: ["mittwald", "ci"],
            ephemeral: true,
            size: "small",
        },
    },
    {
        title: "GitLab project runner",
        input: {
            provider: "gitlab",
            name: "GitLab Runner",
            instanceUrl: "https://gitlab.example.com",
            runnerType: "project_type",
            target: "group/project",
            token: "glpat-0123456789abcdef",
            labels: "mittwald",
            size: "medium",
        },
        expect: {
            provider: "gitlab",
            labels: ["mittwald"],
            ephemeral: false,
            size: "medium",
        },
    },
    {
        title: "GitLab instance runner",
        input: {
            provider: "gitlab",
            name: "Shared Runner",
            instanceUrl: "https://gitlab.example.com/",
            runnerType: "instance_type",
            token: "glpat-0123456789abcdef",
            runUntagged: false,
        },
        expect: {
            provider: "gitlab",
            target: "gitlab.example.com",
            targetUrl: "https://gitlab.example.com",
            labels: ["mittwald"],
        },
    },
];

describe.each(cases)("runner lifecycle: $title", ({
    input,
    expect: expected,
}) => {
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
        const found = zRunnerList.parse(list).find((r) => r.id === runnerId);
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
        expect(found?.updateAvailable).toBe(false);
    });

    it("updates a runner that runs an older image", async () => {
        const schema = await import("@/db/schema.ts");
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
});

describe("input validation", () => {
    it("rejects an ephemeral GitHub runner with a registration token", async () => {
        await expect(
            runner.createRunner(
                client,
                extensionInstanceId,
                projectId,
                userId,
                {
                    provider: "github",
                    name: "broken",
                    target: "acme/app",
                    token: "AEBIHM56SBF3SULYYYY3BH3KU333M",
                    ephemeral: true,
                },
            ),
        ).rejects.toMatchObject({
            messageKey: "error.github.ephemeralNeedsPat",
        });
    });

    it("rejects a GitLab project runner without a path", async () => {
        await expect(
            runner.createRunner(
                client,
                extensionInstanceId,
                projectId,
                userId,
                {
                    provider: "gitlab",
                    name: "broken",
                    instanceUrl: "https://gitlab.example.com",
                    runnerType: "project_type",
                    token: "glpat-0123456789abcdef",
                },
            ),
        ).rejects.toMatchObject({
            messageKey: "error.gitlab.projectPathRequired",
        });
    });
});
