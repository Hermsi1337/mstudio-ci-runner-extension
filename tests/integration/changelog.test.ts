import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { zChangelog } from "@/generated/extension-api/zod.gen";
import { setTestEnvironment } from "../helpers/env.ts";
import { type MockApi, startMockApi } from "../helpers/prism.ts";

let github: MockApi;
let changelog: typeof import("@/domain/changelog.ts");

beforeAll(async () => {
    github = await startMockApi("github");
    setTestEnvironment({ GITHUB_API_URL: github.url });
    changelog = await import("@/domain/changelog.ts");
}, 120_000);

afterAll(async () => {
    await github.container.stop().catch(() => undefined);
});

describe("changelog", () => {
    it("returns the releases from GitHub", async () => {
        const result = await changelog.getChangelog();
        expect(zChangelog.parse(result)).toEqual(result);
        expect(result.releases.length).toBeGreaterThan(0);
        for (const release of result.releases) {
            expect(release.version.startsWith("v")).toBe(false);
        }
        expect(result.currentVersion).not.toBe("");
    });

    it("serves the second call from the cache", async () => {
        const first = await changelog.getChangelog();
        await github.container.stop();
        const second = await changelog.getChangelog();
        expect(second).toEqual(first);
    });
});
