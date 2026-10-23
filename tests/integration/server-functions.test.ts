import { randomUUID } from "node:crypto";
import type { StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
    zChangelog,
    zProjectCapabilities,
    zProjectStackList,
    zRunner,
    zRunnerList,
} from "@/generated/extension-api/zod.gen";
import { type PublicErrorDetails, parsePublicError } from "@/global-errors";
import { translate } from "@/i18n/index.ts";
import { setTestEnvironment } from "../helpers/env.ts";
import { startPostgres } from "../helpers/postgres.ts";
import { type MockApi, startMockApi } from "../helpers/prism.ts";
import {
    buildServer,
    type ExtensionServer,
    type ServerFunction,
    startServer,
} from "../helpers/server.ts";
import {
    type SessionTokenApi,
    startSessionTokenApi,
} from "../helpers/session-token.ts";

/**
 * Calls the server functions of the built extension over HTTP, the way the
 * browser does, so the middleware, the zod validators and the error body run
 * as in production. The session token API is a local stub, mittwald and
 * GitHub are Prism. runner-lifecycle.test.ts covers the domain behavior.
 */
const extensionId = "00000000-0000-0000-0000-00000000ext1";
const extensionSecret = "test-extension-secret";
const userId = "55555555-5555-5555-5555-555555555555";
const own = {
    extensionInstanceId: "11111111-1111-1111-1111-111111111111",
    projectId: "22222222-2222-2222-2222-222222222222",
};
const foreign = {
    extensionInstanceId: "33333333-3333-3333-3333-333333333333",
    projectId: "44444444-4444-4444-4444-444444444444",
};
const foreignRunnerId = randomUUID();

const functions = {
    getChangelog: {
        file: "src/serverFunctions/changelog/get-changelog.ts",
        name: "getChangelogServerFunction",
        method: "GET",
    },
    getProjectCapabilities: {
        file: "src/serverFunctions/project/get-project-capabilities.ts",
        name: "getProjectCapabilitiesServerFunction",
        method: "GET",
    },
    listProjectStacks: {
        file: "src/serverFunctions/project/list-project-stacks.ts",
        name: "listProjectStacksServerFunction",
        method: "GET",
    },
    createRunner: {
        file: "src/serverFunctions/runners/create-runner.ts",
        name: "createRunnerServerFunction",
        method: "POST",
    },
    listRunners: {
        file: "src/serverFunctions/runners/list-runners.ts",
        name: "listRunnersServerFunction",
        method: "GET",
    },
    getRunnerLogs: {
        file: "src/serverFunctions/runners/get-runner-logs.ts",
        name: "getRunnerLogsServerFunction",
        method: "GET",
    },
    restartRunner: {
        file: "src/serverFunctions/runners/restart-runner.ts",
        name: "restartRunnerServerFunction",
        method: "POST",
    },
    configureRunner: {
        file: "src/serverFunctions/runners/configure-runner.ts",
        name: "configureRunnerServerFunction",
        method: "POST",
    },
    updateRunner: {
        file: "src/serverFunctions/runners/update-runner.ts",
        name: "updateRunnerServerFunction",
        method: "POST",
    },
    deleteRunner: {
        file: "src/serverFunctions/runners/delete-runner.ts",
        name: "deleteRunnerServerFunction",
        method: "POST",
    },
} satisfies Record<string, ServerFunction>;

let postgres: StartedPostgreSqlContainer;
let mittwald: MockApi;
let github: MockApi;
let sessionTokens: SessionTokenApi;
let server: ExtensionServer;
let db: ReturnType<typeof import("@/db/index.ts")["getDatabase"]>;
let schema: typeof import("@/db/schema.ts");
let runnerId: string;

function headers(instance: typeof own): Record<string, string> {
    return {
        "x-locale": "en",
        "x-session-token": sessionTokens.issue({
            userId,
            extensionId,
            extensionInstanceId: instance.extensionInstanceId,
            contextId: instance.projectId,
        }),
    };
}

async function expectValidationError(
    fn: ServerFunction,
    data: unknown,
    details: PublicErrorDetails,
): Promise<void> {
    const response = await server.call(fn, { headers: headers(own), data });

    expect(response.result).toBeUndefined();
    expect(parsePublicError(response.error)).toEqual({
        type: "ValidationError",
        message: expect.any(String),
        isRetryable: false,
        details,
    });
}

/** Skips the tests that act on the runner when its creation failed. */
function describeWithRunner(name: string, tests: () => void): void {
    describe(name, () => {
        beforeEach((context) => {
            if (runnerId === undefined) {
                context.skip("createRunner failed");
            }
        });
        tests();
    });
}

beforeAll(async () => {
    // Each resource is kept as soon as it runs, so afterAll stops it even
    // when the build or another container fails.
    const started = await Promise.allSettled([
        startPostgres().then((container) => {
            postgres = container;
        }),
        startMockApi("mittwald-v2").then((api) => {
            mittwald = api;
        }),
        startMockApi("github").then((api) => {
            github = api;
        }),
        startSessionTokenApi(extensionSecret).then((api) => {
            sessionTokens = api;
        }),
        buildServer(),
    ]);
    const failure = started.find(
        (result): result is PromiseRejectedResult =>
            result.status === "rejected",
    );
    if (failure) {
        throw failure.reason;
    }
    setTestEnvironment({
        MITTWALD_API_URL: `${mittwald.url}/`,
        GITHUB_API_URL: github.url,
        EXTENSION_ID: extensionId,
        EXTENSION_SECRET: extensionSecret,
        EXTENSION_VERSION: "1.0.0",
    });

    schema = await import("@/db/schema.ts");
    db = (await import("@/db/index.ts")).getDatabase();
    await db.insert(schema.extensionInstances).values(
        [own, foreign].map(({ extensionInstanceId, projectId }) => ({
            id: extensionInstanceId,
            contextId: projectId,
            context: "project" as const,
            active: true,
            consentedScopes: ["stack:read", "stack:write", "stack:delete"],
            secret: "instance-secret",
        })),
    );
    await db.insert(schema.runners).values({
        id: foreignRunnerId,
        extensionInstanceId: foreign.extensionInstanceId,
        projectId: foreign.projectId,
        stackId: "77777777-7777-7777-7777-777777777777",
        provider: "forgejo",
        name: "Foreign Runner",
        runnerName: "foreign-runner",
        target: "forgejo.example.com",
        targetUrl: "https://forgejo.example.com",
        labels: "[]",
        createdBy: userId,
    });

    server = await startServer({
        MW_EXT_API_URL: sessionTokens.url,
        LOG_LEVEL: "warn",
    });
});

afterAll(async () => {
    await server?.stop();
    await db?.$client.end();
    await Promise.all([
        sessionTokens?.stop(),
        postgres?.stop(),
        mittwald?.container.stop(),
        github?.container.stop(),
    ]);
});

describe("authentication middleware", () => {
    const unexpected = {
        type: "UnknownError",
        message: translate("en", "error.unexpected"),
        isRetryable: false,
        details: {},
    };

    it.each([functions.listRunners, functions.getChangelog])(
        "rejects $name without a session token",
        async (fn) => {
            const response = await server.call(fn, {
                headers: { "x-locale": "en" },
            });

            expect(response.result).toBeUndefined();
            expect(parsePublicError(response.error)).toEqual(unexpected);
        },
    );

    it("rejects a session token whose claims were changed after signing", async () => {
        const [, foreignClaims] =
            headers(foreign)["x-session-token"].split(".");
        const [header, , signature] =
            headers(own)["x-session-token"].split(".");

        const response = await server.call(functions.listRunners, {
            headers: {
                "x-locale": "en",
                "x-session-token": [header, foreignClaims, signature].join("."),
            },
        });

        expect(response.result).toBeUndefined();
        expect(parsePublicError(response.error)).toEqual(unexpected);
    });
});

describe("getChangelog", () => {
    it("returns the changelog", async () => {
        const response = await server.call(functions.getChangelog, {
            headers: headers(own),
        });

        expect(response.error).toBeUndefined();
        expect(zChangelog.parse(response.result).currentVersion).toBe("1.0.0");
    });
});

describe("project", () => {
    it("returns the capabilities of the project", async () => {
        const response = await server.call(functions.getProjectCapabilities, {
            headers: headers(own),
        });

        expect(response.error).toBeUndefined();
        expect(() => zProjectCapabilities.parse(response.result)).not.toThrow();
    });

    it("lists the stacks of the project", async () => {
        const response = await server.call(functions.listProjectStacks, {
            headers: headers(own),
        });

        expect(response.error).toBeUndefined();
        expect(() => zProjectStackList.parse(response.result)).not.toThrow();
    });
});

describe("createRunner", () => {
    it("rejects a body that matches no provider without naming a field", () =>
        expectValidationError(
            functions.createRunner,
            { provider: "forgejo", name: "Forgejo Runner" },
            {},
        ));

    it("creates a runner for the instance and project of the session token", async () => {
        const response = await server.call(functions.createRunner, {
            headers: headers(own),
            data: {
                provider: "forgejo",
                name: "Forgejo Runner",
                instanceUrl: "https://forgejo.example.com/",
                tokenType: "registration",
                uuid: "c9e50be9-a7c3-4aee-ba35-624c4ff8c519",
                token: "6634bb58be0db23cc013a2e72dd1828ae0257cf",
            },
        });

        expect(response.error).toBeUndefined();
        const created = zRunner.parse(response.result);
        expect(created).toMatchObject({
            provider: "forgejo",
            name: "Forgejo Runner",
            target: "forgejo.example.com",
        });
        runnerId = created.id;
        const [row] = await db
            .select()
            .from(schema.runners)
            .where(eq(schema.runners.id, runnerId));
        expect(row).toMatchObject({
            extensionInstanceId: own.extensionInstanceId,
            projectId: own.projectId,
            createdBy: userId,
        });
    });
});

describeWithRunner("listRunners", () => {
    it("lists the runners of the session token's instance only", async () => {
        const response = await server.call(functions.listRunners, {
            headers: headers(own),
        });

        expect(response.error).toBeUndefined();
        const ids = zRunnerList.parse(response.result).map(({ id }) => id);
        expect(ids).toEqual([runnerId]);
    });
});

describeWithRunner("getRunnerLogs", () => {
    it("rejects a tail below the minimum", () =>
        expectValidationError(
            functions.getRunnerLogs,
            { runnerId, tail: 5 },
            { affectedField: "tail" },
        ));

    it("returns the logs", async () => {
        const response = await server.call(functions.getRunnerLogs, {
            headers: headers(own),
            data: { runnerId, tail: 50 },
        });

        expect(response.error).toBeUndefined();
        expect(typeof response.result).toBe("string");
    });
});

describeWithRunner("restartRunner", () => {
    it("rejects a runner id that is no UUID", () =>
        expectValidationError(
            functions.restartRunner,
            { runnerId: "runner" },
            { affectedField: "runnerId" },
        ));

    it("refuses a runner of another instance", async () => {
        const response = await server.call(functions.restartRunner, {
            headers: headers(own),
            data: { runnerId: foreignRunnerId },
        });

        expect(parsePublicError(response.error)).toEqual({
            type: "NotFoundError",
            message: translate("en", "error.notFound.runner"),
            isRetryable: false,
            details: {},
        });
    });

    it("restarts the runner", async () => {
        const response = await server.call(functions.restartRunner, {
            headers: headers(own),
            data: { runnerId },
        });

        expect(response.error).toBeUndefined();
    });
});

describeWithRunner("configureRunner", () => {
    it("rejects a cache size of zero", () =>
        expectValidationError(
            functions.configureRunner,
            { runnerId, cache: true, cacheSizeGb: 0 },
            { affectedField: "cacheSizeGb" },
        ));

    it("rejects a name with one character", () =>
        expectValidationError(
            functions.configureRunner,
            { runnerId, cache: false, name: "x" },
            { affectedField: "name" },
        ));

    it("refuses to rename a runner of another instance", async () => {
        const response = await server.call(functions.configureRunner, {
            headers: headers(own),
            data: { runnerId: foreignRunnerId, cache: false, name: "Hijacked" },
        });

        expect(parsePublicError(response.error)).toEqual({
            type: "NotFoundError",
            message: translate("en", "error.notFound.runner"),
            isRetryable: false,
            details: {},
        });
        const [foreignRow] = await db
            .select({ name: schema.runners.name })
            .from(schema.runners)
            .where(eq(schema.runners.id, foreignRunnerId));
        expect(foreignRow?.name).toBe("Foreign Runner");
    });

    it("changes the settings", async () => {
        const response = await server.call(functions.configureRunner, {
            headers: headers(own),
            data: { runnerId, cache: true, cacheSizeGb: 5 },
        });

        expect(response.error).toBeUndefined();
        expect(zRunner.parse(response.result)).toMatchObject({
            cache: true,
            cacheSizeGb: 5,
        });
    });
});

describeWithRunner("updateRunner", () => {
    it("rejects a runner id that is no UUID", () =>
        expectValidationError(
            functions.updateRunner,
            { runnerId: "runner" },
            { affectedField: "runnerId" },
        ));

    it("updates a runner that runs an older image", async () => {
        await db
            .update(schema.runners)
            .set({
                image: "ghcr.io/hermsi1337/outdated:0.0.1",
                runnerVersion: "0.0.1",
            })
            .where(eq(schema.runners.id, runnerId));

        const response = await server.call(functions.updateRunner, {
            headers: headers(own),
            data: { runnerId },
        });

        expect(response.error).toBeUndefined();
        expect(zRunner.parse(response.result).updateAvailable).toBe(false);
    });
});

describeWithRunner("deleteRunner", () => {
    it("rejects a runner id that is no UUID", () =>
        expectValidationError(
            functions.deleteRunner,
            { runnerId: "runner" },
            { affectedField: "runnerId" },
        ));

    it("deletes the runner", async () => {
        const response = await server.call(functions.deleteRunner, {
            headers: headers(own),
            data: { runnerId },
        });

        expect(response.error).toBeUndefined();
        const rows = await db
            .select()
            .from(schema.runners)
            .where(eq(schema.runners.id, runnerId));
        expect(rows).toEqual([]);
    });
});
