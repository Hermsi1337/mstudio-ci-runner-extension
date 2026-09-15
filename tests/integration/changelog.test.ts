import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { zChangelog } from "@/generated/extension-api/zod.gen";
import { isNewerVersion } from "@/version-compare.ts";
import { setTestEnvironment } from "../helpers/env.ts";
import { type MockApi, startMockApi } from "../helpers/prism.ts";

/**
 * The GitHub mock answers with the example release of the upstream spec,
 * tag v1.0.0. The extension version is set to both sides of it to cover the
 * deployment filter.
 */
let github: MockApi;
let changelog: typeof import("@/domain/changelog.ts");

beforeAll(async () => {
    github = await startMockApi("github");
    setTestEnvironment({
        GITHUB_API_URL: github.url,
        EXTENSION_VERSION: "1.0.0",
    });
    changelog = await import("@/domain/changelog.ts");
}, 120_000);

afterAll(async () => {
    await github.container.stop().catch(() => undefined);
});

describe("changelog", () => {
    it("returns the releases from GitHub up to the running version", async () => {
        const result = await changelog.getChangelog();
        expect(zChangelog.parse(result)).toEqual(result);
        expect(result.currentVersion).toBe("1.0.0");
        expect(result.releases.length).toBeGreaterThan(0);
        for (const release of result.releases) {
            expect(release.version.startsWith("v")).toBe(false);
            expect(isNewerVersion(release.version, "1.0.0")).toBe(false);
        }
    });

    it("serves the second call from the cache", async () => {
        const first = await changelog.getChangelog();
        await github.container.stop();
        const second = await changelog.getChangelog();
        expect(second).toEqual(first);
    });

    it("hides releases that are not deployed yet", async () => {
        process.env.EXTENSION_VERSION = "0.9.0";
        const result = await changelog.getChangelog();
        expect(result.currentVersion).toBe("0.9.0");
        expect(result.releases).toEqual([]);
    });
});
