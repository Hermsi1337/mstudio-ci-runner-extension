import { Octokit } from "@octokit/rest";
import { getEnvironmentVariables } from "@/env.ts";
import type { Changelog, Release } from "@/generated/extension-api";
import { createLogger } from "@/logger.ts";
import { isNewerVersion } from "@/version-compare.ts";

const log = createLogger("changelog");

const REPOSITORY = { owner: "Hermsi1337", repo: "mstudio-ci-runner-extension" };
const CACHE_TTL_MS = 10 * 60_000;

let cache: { fetchedAt: number; releases: Release[] } | null = null;

async function fetchReleases(): Promise<Release[]> {
    const octokit = new Octokit({
        baseUrl: getEnvironmentVariables().GITHUB_API_URL,
        userAgent: "mstudio-ci-runner-extension",
    });
    const response = await octokit.rest.repos.listReleases({
        ...REPOSITORY,
        per_page: 20,
        headers: { accept: "application/json" },
    });

    return response.data
        .filter((release) => !release.draft && !release.prerelease)
        .map((release) => ({
            version: release.tag_name.replace(/^v/, ""),
            publishedAt: release.published_at ?? release.created_at,
            notes: release.body ?? "",
            url: release.html_url,
        }));
}

async function listReleases(): Promise<Release[]> {
    if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
        return cache.releases;
    }
    try {
        cache = { fetchedAt: Date.now(), releases: await fetchReleases() };
    } catch (fetchError) {
        log.warn("fetching releases from GitHub failed", {
            error: fetchError instanceof Error ? fetchError.message : "",
        });
        if (!cache) {
            return [];
        }
        cache.fetchedAt = Date.now();
    }

    return cache.releases;
}

export async function getChangelog(): Promise<Changelog> {
    const currentVersion = getEnvironmentVariables().EXTENSION_VERSION;
    const releases = await listReleases();
    const latestVersion = releases[0]?.version ?? null;

    return {
        currentVersion,
        latestVersion,
        updateAvailable:
            latestVersion !== null &&
            isNewerVersion(latestVersion, currentVersion),
        releases,
    };
}
