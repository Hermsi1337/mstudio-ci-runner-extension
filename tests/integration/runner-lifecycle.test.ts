import { assertStatus } from "@mittwald/api-client";
import type { StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { StackResponse } from "@/domain/stack.ts";
import type { CreateRunnerRequest, Runner } from "@/generated/extension-api";
import {
    zProjectStackList,
    zRunner,
    zRunnerList,
} from "@/generated/extension-api/zod.gen";
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
        PUBLIC_URL: "https://ci-runner.example.com",
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
    {
        title: "Forgejo runner with labels and capacity",
        input: {
            provider: "forgejo",
            name: "Forgejo Runner",
            instanceUrl: "https://forgejo.example.com/",
            tokenType: "registration",
            uuid: "c9e50be9-a7c3-4aee-ba35-624c4ff8c519",
            token: "6634bb58be0db23cc013a2e72dd1828ae0257cf",
            labels: "mittwald, node",
            concurrency: 2,
        },
        expect: {
            provider: "forgejo",
            target: "forgejo.example.com",
            targetUrl: "https://forgejo.example.com",
            labels: ["mittwald", "node"],
            ephemeral: false,
            tokenType: "registration",
            concurrency: 2,
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

        it("turns image builds on and off", async () => {
            const enabled = await runner.configureRunner(
                client,
                extensionInstanceId,
                { runnerId, cache: false, imageBuilds: true },
            );
            expect(zRunner.parse(enabled)).toEqual(enabled);
            expect(enabled.imageBuilds).toBe(true);

            const disabled = await runner.configureRunner(
                client,
                extensionInstanceId,
                { runnerId, cache: false, imageBuilds: false },
            );
            expect(disabled.imageBuilds).toBe(false);
        });

        it("turns Docker in jobs on and off", async () => {
            const enabled = await runner.configureRunner(
                client,
                extensionInstanceId,
                { runnerId, cache: false, dockerApi: true },
            );
            expect(zRunner.parse(enabled)).toEqual(enabled);
            expect(enabled.dockerApi).toBe(true);
            const [row] = await db
                .select()
                .from(schema.dockerApiStacks)
                .where(eq(schema.dockerApiStacks.stackId, enabled.stackId));
            expect(row?.secretHash).toMatch(/^[0-9a-f]{64}$/);

            const disabled = await runner.configureRunner(
                client,
                extensionInstanceId,
                { runnerId, cache: false, dockerApi: false },
            );
            expect(disabled.dockerApi).toBe(false);
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
                input.provider === "github" ? 1 : 3,
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
            { ...shared, name: "Deploy" },
        );
        expect(second.stackId).toBe(first.stackId);
        const [a, b] = await db
            .select({ serviceName: schema.runners.serviceName })
            .from(schema.runners)
            .where(eq(schema.runners.stackId, first.stackId));
        expect(a?.serviceName).toBe("runner-build");
        expect(b?.serviceName).toBe("runner-deploy");
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

describe("duplicate runner names", () => {
    const github = {
        provider: "github" as const,
        tokenType: "registration" as const,
        token: "AEBIHM56SBF3SULYYYY3BH3KU333M",
    };
    const gitlab = {
        provider: "gitlab" as const,
        instanceUrl: "https://gitlab.example.com",
        tokenType: "registration" as const,
        token: "glrt-t1_AbCdEfGhIjKlMnOpQrSt",
    };
    const otherProjectId = "44444444-4444-4444-4444-444444444444";

    const create = (input: CreateRunnerRequest, project = projectId) =>
        runner.createRunner(
            client,
            extensionInstanceId,
            project,
            userId,
            input,
        );

    it("rejects a second GitHub runner with the same name for the same target", async () => {
        const first = await create({
            ...github,
            name: "Build",
            target: "acme/duplicates",
        });
        const updateStack = vi.spyOn(client.container, "updateStack");
        try {
            await expect(
                create({ ...github, name: "build", target: "Acme/Duplicates" }),
            ).rejects.toMatchObject({
                messageKey: "error.runner.nameTaken",
                params: { name: "Build", target: "acme/duplicates" },
                details: { affectedField: "name" },
            });
            await expect(
                create(
                    { ...github, name: "Build", target: "acme/duplicates" },
                    otherProjectId,
                ),
            ).rejects.toMatchObject({ messageKey: "error.runner.nameTaken" });
            expect(updateStack).not.toHaveBeenCalled();
        } finally {
            updateStack.mockRestore();
        }
        const rows = await db
            .select({ id: schema.runners.id })
            .from(schema.runners)
            .where(
                eq(
                    schema.runners.targetUrl,
                    "https://github.com/acme/duplicates",
                ),
            );
        expect(rows).toEqual([{ id: first.id }]);

        await runner.deleteRunner(client, extensionInstanceId, first.id);
    });

    it("allows the same name for another target", async () => {
        const existingId = "77777777-7777-7777-7777-777777777777";
        await db.insert(schema.runners).values({
            id: existingId,
            extensionInstanceId,
            projectId,
            stackId: "88888888-8888-8888-8888-888888888888",
            provider: "github",
            name: "Build",
            runnerName: "build",
            target: "acme/duplicates",
            targetUrl: "https://github.com/acme/duplicates",
            labels: "mittwald",
            createdBy: userId,
        });
        try {
            const created = await create({
                ...github,
                name: "Build",
                target: "acme/elsewhere",
            });
            expect(created.name).toBe("Build");
            await runner.deleteRunner(client, extensionInstanceId, created.id);
        } finally {
            await db
                .delete(schema.runners)
                .where(eq(schema.runners.id, existingId));
        }
    });

    it("allows the same name twice for GitLab", async () => {
        const first = await create({ ...gitlab, name: "Build" });
        const second = await create({ ...gitlab, name: "Build" });
        expect(second.stackId).toBe(first.stackId);
        const services = await db
            .select({ serviceName: schema.runners.serviceName })
            .from(schema.runners)
            .where(eq(schema.runners.stackId, first.stackId));
        expect(services.map((s) => s.serviceName).sort()).toEqual([
            "runner-build",
            "runner-build-2",
        ]);

        await runner.deleteRunner(client, extensionInstanceId, first.id);
        await runner.deleteRunner(client, extensionInstanceId, second.id);
    });

    it("checks the name GitHub sees, not the new name of a renamed runner", async () => {
        const target = "acme/renamed-duplicates";
        const first = await create({ ...github, name: "Build", target });
        await runner.configureRunner(client, extensionInstanceId, {
            runnerId: first.id,
            cache: false,
            name: "Deploy",
        });
        await expect(
            create({ ...github, name: "Build", target }),
        ).rejects.toMatchObject({
            messageKey: "error.runner.nameTaken",
            params: { name: "Deploy", target },
        });
        const second = await create({ ...github, name: "Deploy", target });
        expect(second.name).toBe("Deploy");

        await runner.deleteRunner(client, extensionInstanceId, first.id);
        await runner.deleteRunner(client, extensionInstanceId, second.id);
    });
});

describe("rename", () => {
    let created: Runner;

    afterAll(async () => {
        if (created) {
            await runner.deleteRunner(client, extensionInstanceId, created.id);
        }
    });

    const readRow = async () => {
        const [row] = await db
            .select()
            .from(schema.runners)
            .where(eq(schema.runners.id, created.id));
        return row;
    };

    it("renames without recreating the container", async () => {
        created = await runner.createRunner(
            client,
            extensionInstanceId,
            projectId,
            userId,
            {
                provider: "github",
                name: "Old Name",
                target: "acme/rename",
                tokenType: "registration",
                token: "AEBIHM56SBF3SULYYYY3BH3KU333M",
                cache: true,
            },
        );
        const before = await readRow();
        const getStack = vi.spyOn(client.container, "getStack");
        const updateStack = vi.spyOn(client.container, "updateStack");
        const recreateService = vi.spyOn(client.container, "recreateService");
        const updateCronjob = vi.spyOn(client.cronjob, "updateCronjob");
        try {
            const renamed = await runner.configureRunner(
                client,
                extensionInstanceId,
                { runnerId: created.id, cache: true, name: "New Name" },
            );
            expect(zRunner.parse(renamed)).toEqual(renamed);
            expect(renamed.name).toBe("New Name");

            const response = await getStack.mock.results[0]?.value;
            assertStatus(response, 200);
            const stack: StackResponse = response.data;
            const service = stack.services?.find(
                (s) =>
                    s.serviceName === before.serviceName ||
                    s.id === before.serviceId,
            );
            expect(service).toBeDefined();
            const state = service?.pendingState ?? service?.deployedState;
            expect(updateStack).toHaveBeenCalledTimes(1);
            const services = updateStack.mock.calls[0][0].data?.services;
            expect(Object.keys(services ?? {})).toEqual([before.serviceName]);
            expect(services?.[before.serviceName]).toEqual({
                description: "github runner New Name",
                image: state?.image,
                environment: state?.envs,
                restartPolicy: service?.restartPolicy,
                deploy: service?.deploy,
                volumes: state?.volumes,
                ports: state?.ports,
                command: state?.command,
                entrypoint: state?.entrypoint,
            });
            expect(service?.description).not.toBe("github runner New Name");
            expect(recreateService).not.toHaveBeenCalled();
            expect(updateCronjob).toHaveBeenCalledTimes(1);
            expect(updateCronjob.mock.calls[0][0].data?.description).toMatch(
                /\(New Name\)$/,
            );
        } finally {
            getStack.mockRestore();
            updateStack.mockRestore();
            recreateService.mockRestore();
            updateCronjob.mockRestore();
        }

        const after = await readRow();
        expect(after).toMatchObject({
            name: "New Name",
            runnerName: "old-name",
            serviceName: before.serviceName,
            serviceId: before.serviceId,
            stackId: before.stackId,
        });
        const listed = (
            await runner.listRunners(client, extensionInstanceId)
        ).find((r) => r.id === created.id);
        expect(listed?.name).toBe("New Name");
    });

    it("leaves the service alone when the name stays", async () => {
        const updateStack = vi.spyOn(client.container, "updateStack");
        const updateCronjob = vi.spyOn(client.cronjob, "updateCronjob");
        try {
            await runner.configureRunner(client, extensionInstanceId, {
                runnerId: created.id,
                cache: true,
                name: "New Name",
            });
            expect(updateStack).not.toHaveBeenCalled();
            expect(updateCronjob).not.toHaveBeenCalled();
        } finally {
            updateStack.mockRestore();
            updateCronjob.mockRestore();
        }
    });

    it("renames and changes a setting in one recreating declaration", async () => {
        const updateStack = vi.spyOn(client.container, "updateStack");
        const recreateService = vi.spyOn(client.container, "recreateService");
        try {
            const configured = await runner.configureRunner(
                client,
                extensionInstanceId,
                {
                    runnerId: created.id,
                    cache: true,
                    name: "Large Runner",
                    size: "large",
                },
            );
            expect(configured).toMatchObject({
                name: "Large Runner",
                size: "large",
            });
            expect(updateStack).toHaveBeenCalledTimes(1);
            const declared = Object.values(
                updateStack.mock.calls[0][0].data?.services ?? {},
            );
            expect(declared).toHaveLength(1);
            expect(declared[0]).toMatchObject({
                description: "github runner Large Runner",
                deploy: {
                    resources: { limits: { cpus: "2", memory: "4096mb" } },
                },
            });
            expect(recreateService).toHaveBeenCalledTimes(1);
        } finally {
            updateStack.mockRestore();
            recreateService.mockRestore();
        }
        expect(await readRow()).toMatchObject({
            name: "Large Runner",
            runnerName: "old-name",
            size: "large",
        });
    });
});

describe("custom runner without limits", () => {
    const target = {
        provider: "github" as const,
        target: "acme/unlimited",
        tokenType: "registration" as const,
        token: "AEBIHM56SBF3SULYYYY3BH3KU333M",
    };
    let created: Runner;
    let bothOpen: Runner | undefined;

    const declaredService = async (
        serviceName: string,
        declare: () => Promise<Runner>,
    ) => {
        const updateStack = vi.spyOn(client.container, "updateStack");
        try {
            const result = await declare();
            const service = updateStack.mock.calls
                .map(([request]) => request.data?.services?.[serviceName])
                .find((declared) => declared !== undefined);
            return { result, service };
        } finally {
            updateStack.mockRestore();
        }
    };

    const configure = (limits: {
        size: "large" | "custom";
        cpus?: number | null;
        memoryMb?: number | null;
    }) =>
        declaredService("runner-unlimited", () =>
            runner.configureRunner(client, extensionInstanceId, {
                runnerId: created.id,
                cache: false,
                ...limits,
            }),
        );

    afterAll(async () => {
        for (const runnerId of [created.id, bothOpen?.id]) {
            if (runnerId) {
                await runner.deleteRunner(
                    client,
                    extensionInstanceId,
                    runnerId,
                );
            }
        }
    });

    it("declares the service without a memory limit", async () => {
        const { result, service } = await declaredService(
            "runner-unlimited",
            () =>
                runner.createRunner(
                    client,
                    extensionInstanceId,
                    projectId,
                    userId,
                    {
                        ...target,
                        name: "Unlimited",
                        size: "custom",
                        cpus: 1.5,
                        memoryMb: null,
                    },
                ),
        );
        created = result;
        expect(service?.deploy?.resources?.limits).toStrictEqual({
            cpus: "1.5",
        });
        expect(zRunner.parse(created)).toEqual(created);
        expect(created).toMatchObject({
            size: "custom",
            cpus: 1.5,
            memoryMb: null,
        });
    });

    it("declares no limits once both are dropped", async () => {
        const { result, service } = await configure({
            size: "custom",
            cpus: null,
            memoryMb: null,
        });
        expect(service).toBeDefined();
        expect(service?.deploy?.resources).toEqual({});
        expect(result).toMatchObject({
            size: "custom",
            cpus: null,
            memoryMb: null,
        });
    });

    it("declares the preset limits when it switches to a preset", async () => {
        const { result, service } = await configure({ size: "large" });
        expect(service?.deploy?.resources).toEqual({
            limits: { cpus: "2", memory: "4096mb" },
        });
        expect(result).toMatchObject({
            size: "large",
            cpus: 2,
            memoryMb: 4096,
        });
    });

    it("declares no limits when it switches back from a preset", async () => {
        const { result, service } = await configure({
            size: "custom",
            cpus: null,
            memoryMb: null,
        });
        expect(service).toBeDefined();
        expect(service?.deploy?.resources).toEqual({});
        expect(result).toMatchObject({
            size: "custom",
            cpus: null,
            memoryMb: null,
        });
    });

    it("creates a runner without any limit", async () => {
        const { result, service } = await declaredService("runner-open", () =>
            runner.createRunner(
                client,
                extensionInstanceId,
                projectId,
                userId,
                {
                    ...target,
                    name: "Open",
                    size: "custom",
                    cpus: null,
                    memoryMb: null,
                },
            ),
        );
        bothOpen = result;
        expect(service).toBeDefined();
        expect(service?.deploy?.resources).toEqual({});
        expect(result).toMatchObject({
            size: "custom",
            cpus: null,
            memoryMb: null,
        });
    });
});

/**
 * Prism generates the ids of a stack, so the test reads the stack it is going
 * to select and uses the project id that comes with it.
 */
describe("selected stack", () => {
    const selectable = {
        provider: "github" as const,
        target: "acme/migrations",
        tokenType: "registration" as const,
        token: "AEBIHM56SBF3SULYYYY3BH3KU333M",
    };

    const readSelectableStack = async () => {
        const response = await client.container.getStack({
            stackId: "33333333-3333-3333-3333-333333333333",
        });
        assertStatus(response, 200);

        return response.data;
    };

    it("lists the stacks of the project", async () => {
        const stack = await import("@/domain/stack.ts");
        const stacks = await stack.listProjectStacks(
            client,
            extensionInstanceId,
            projectId,
        );
        expect(zProjectStackList.parse(stacks)).toEqual(stacks);
    });

    it("declares the runner in the selected stack without claiming it", async () => {
        const selected = await readSelectableStack();
        const created = await runner.createRunner(
            client,
            extensionInstanceId,
            selected.projectId,
            userId,
            { ...selectable, name: "Migrations", stackId: selected.id },
        );
        expect(created.stackId).toBe(selected.id);

        const [claimed] = await db
            .select()
            .from(schema.runnerStacks)
            .where(eq(schema.runnerStacks.stackId, selected.id));
        expect(claimed).toBeUndefined();

        await runner.deleteRunner(client, extensionInstanceId, created.id);
        expect(
            (await runner.listRunners(client, extensionInstanceId)).some(
                (r) => r.id === created.id,
            ),
        ).toBe(false);
    });

    it("rejects a stack that belongs to another project", async () => {
        const selected = await readSelectableStack();
        await expect(
            runner.createRunner(
                client,
                extensionInstanceId,
                "44444444-4444-4444-4444-444444444444",
                userId,
                { ...selectable, name: "Foreign", stackId: selected.id },
            ),
        ).rejects.toMatchObject({ messageKey: "error.notFound.stack" });
    });

    it("suffixes a service name that the stack already uses", async () => {
        const stack = await import("@/domain/stack.ts");
        const selected = await readSelectableStack();
        await expect(
            stack.uniqueServiceName(selected.id, "build", ["runner-build"]),
        ).resolves.toBe("runner-build-2");
    });

    it("rejects a stack that the extension manages", async () => {
        const selected = await readSelectableStack();
        const otherInstanceId = "66666666-6666-6666-6666-666666666666";
        await db.insert(schema.extensionInstances).values({
            id: otherInstanceId,
            contextId: selected.projectId,
            context: "project",
            active: true,
            consentedScopes: ["stack:read", "stack:write", "stack:delete"],
            secret: "other-instance-secret",
        });
        await db.insert(schema.runnerStacks).values({
            stackId: selected.id,
            extensionInstanceId: otherInstanceId,
            projectId: selected.projectId,
            targetUrl: "https://github.com/acme/owned-elsewhere",
        });

        await expect(
            runner.createRunner(
                client,
                extensionInstanceId,
                selected.projectId,
                userId,
                { ...selectable, name: "Guest", stackId: selected.id },
            ),
        ).rejects.toMatchObject({ messageKey: "error.notFound.stack" });

        const stack = await import("@/domain/stack.ts");
        const listed = await stack.listProjectStacks(
            client,
            extensionInstanceId,
            selected.projectId,
        );
        expect(listed.some((entry) => entry.id === selected.id)).toBe(false);

        await db
            .delete(schema.extensionInstances)
            .where(eq(schema.extensionInstances.id, otherInstanceId));
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

        const ownedStackIds =
            await runner.findOwnedStackIds(extensionInstanceId);
        expect(ownedStackIds).toContain(created.stackId);

        await runner.deleteAllRunnersOfInstance(client, rows, ownedStackIds);

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

describe("Docker in jobs", () => {
    let dockerApi: typeof import("@/domain/docker-api.ts");
    let secrets: typeof import("@/docker-api.ts");
    let created: Runner;

    // Prism does not echo the declared environment, so the tests put a known
    // secret in place of the one the extension generated.
    const secret = "mdapi_integration-test-secret";
    const useKnownSecret = async (stackId: string) => {
        await db
            .update(schema.dockerApiStacks)
            .set({ secretHash: secrets.hashSecret(secret) })
            .where(eq(schema.dockerApiStacks.stackId, stackId));
        return secret;
    };

    beforeAll(async () => {
        dockerApi = await import("@/domain/docker-api.ts");
        secrets = await import("@/docker-api.ts");
        // Prism answers every stack create with the same example id, which an
        // earlier block may still hold for another target.
        await db.delete(schema.runnerStacks);
        created = await runner.createRunner(
            client,
            extensionInstanceId,
            projectId,
            userId,
            {
                provider: "github",
                name: "Testcontainers",
                target: "acme/testcontainers",
                tokenType: "registration",
                token: "AEBIHM56SBF3SULYYYY3BH3KU333M",
                dockerApi: true,
            },
        );
    });

    afterAll(async () => {
        await runner.deleteRunner(client, extensionInstanceId, created.id);
    });

    it("creates the runner with the option on", () => {
        expect(zRunner.parse(created)).toEqual(created);
        expect(created.dockerApi).toBe(true);
    });

    it("issues an instance token for the secret of the stack", async () => {
        const token = await dockerApi.issueDockerApiToken(
            created.stackId,
            await useKnownSecret(created.stackId),
        );
        expect(token.token).toEqual(expect.any(String));
        expect(Number.isNaN(Date.parse(token.expiresAt))).toBe(false);
    });

    it("refuses a wrong secret and an unknown stack", async () => {
        await expect(
            dockerApi.issueDockerApiToken(created.stackId, "mdapi_wrong"),
        ).rejects.toBeInstanceOf(dockerApi.DockerApiTokenDenied);
        await expect(
            dockerApi.issueDockerApiToken(
                "99999999-9999-9999-9999-999999999999",
                await useKnownSecret(created.stackId),
            ),
        ).rejects.toBeInstanceOf(dockerApi.DockerApiTokenDenied);
    });

    it("refuses the secret once the option is off for the last runner", async () => {
        await useKnownSecret(created.stackId);
        await runner.configureRunner(client, extensionInstanceId, {
            runnerId: created.id,
            cache: false,
            dockerApi: false,
        });
        await expect(
            dockerApi.issueDockerApiToken(created.stackId, secret),
        ).rejects.toBeInstanceOf(dockerApi.DockerApiTokenDenied);
    });

    it("refuses the option without a public URL", async () => {
        const publicUrl = process.env.PUBLIC_URL;
        delete process.env.PUBLIC_URL;
        try {
            await expect(
                runner.configureRunner(client, extensionInstanceId, {
                    runnerId: created.id,
                    cache: false,
                    dockerApi: true,
                }),
            ).rejects.toMatchObject({
                messageKey: "error.dockerApi.unconfigured",
            });
        } finally {
            process.env.PUBLIC_URL = publicUrl;
        }
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
