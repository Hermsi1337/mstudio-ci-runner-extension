import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const baseEnv = {
    POSTGRES_USER: "u",
    POSTGRES_PASSWORD: "p",
    POSTGRES_DB: "d",
    POSTGRES_HOST: "h",
    POSTGRES_PORT: "5432",
    EXTENSION_ID: "e",
    EXTENSION_SECRET: "s",
    ENCRYPTION_MASTER_PASSWORD: "m",
    ENCRYPTION_SALT: "salt",
};

async function loadLogger(overrides: Record<string, string>) {
    vi.resetModules();
    for (const [key, value] of Object.entries({ ...baseEnv, ...overrides })) {
        vi.stubEnv(key, value);
    }
    return import("./logger.ts");
}

describe("logger", () => {
    let stdout: string[];
    let stderr: string[];

    beforeEach(() => {
        stdout = [];
        stderr = [];
        vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
            stdout.push(String(chunk));
            return true;
        });
        vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
            stderr.push(String(chunk));
            return true;
        });
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllEnvs();
    });

    it("drops entries below the configured level", async () => {
        const { createLogger } = await loadLogger({
            LOG_LEVEL: "info",
            LOG_FORMAT: "text",
        });
        const log = createLogger("test");
        log.debug("hidden");
        log.info("shown");
        expect(stdout).toHaveLength(1);
        expect(stdout[0]).toContain("INFO  [test] shown");
    });

    it("writes json with scope, fields and serialized errors", async () => {
        const { createLogger } = await loadLogger({
            LOG_LEVEL: "debug",
            LOG_FORMAT: "json",
        });
        createLogger("runner").error("failed", {
            runnerId: "r1",
            error: new Error("boom"),
            skipped: undefined,
        });
        const entry = JSON.parse(stderr[0]);
        expect(entry).toMatchObject({
            level: "error",
            scope: "runner",
            message: "failed",
            runnerId: "r1",
            error: { name: "Error", message: "boom" },
        });
        expect(entry).not.toHaveProperty("skipped");
    });

    it("adds request context fields to every line inside the scope", async () => {
        const { createLogger, withLogContext, addLogContext } =
            await loadLogger({ LOG_LEVEL: "debug", LOG_FORMAT: "json" });
        const log = createLogger("x");
        await withLogContext({ requestId: "abc" }, async () => {
            addLogContext({ userId: "u1" });
            await Promise.resolve();
            log.info("inside");
        });
        log.info("outside");
        expect(JSON.parse(stdout[0])).toMatchObject({
            requestId: "abc",
            userId: "u1",
            message: "inside",
        });
        expect(JSON.parse(stdout[1])).not.toHaveProperty("requestId");
    });

    it("quotes text values containing whitespace", async () => {
        const { createLogger } = await loadLogger({
            LOG_LEVEL: "debug",
            LOG_FORMAT: "text",
        });
        createLogger("x").info("msg", { target: "a b", count: 2 });
        expect(stdout[0]).toContain('target="a b" count=2');
    });
});
