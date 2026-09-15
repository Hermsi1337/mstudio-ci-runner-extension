import { getEnvironmentVariables } from "@/env.ts";
import runnerVersions from "../../../docker/runner/versions.json";
import {
    DATA_VOLUME_MOUNT,
    type ProviderRequest,
    type RunnerProvider,
} from "./types.ts";

type GitHubTarget =
    | { scope: "repo"; owner: string; repo: string; url: string }
    | { scope: "org"; org: string; url: string };

const GITHUB_HOST = "https://github.com/";

export function parseGitHubTarget(input: string): GitHubTarget {
    const path = input
        .trim()
        .replace(GITHUB_HOST, "")
        .replace(/^\/+|\/+$/g, "");
    const [first, second] = path.split("/");
    if (second) {
        return {
            scope: "repo",
            owner: first,
            repo: second,
            url: `${GITHUB_HOST}${first}/${second}`,
        };
    }
    return { scope: "org", org: first, url: `${GITHUB_HOST}${first}` };
}

/**
 * The container registers once with the registration token and keeps its
 * runner credentials in the data volume, so restarts do not need a new token.
 * The token is worthless after one hour and is not stored. Nothing to clean
 * up on the provider side; GitHub removes an offline runner after 14 days.
 *
 * A PAT mode existed and is disabled: the PAT lived in the runner container
 * where every job can read it. Bringing ephemeral runners back needs the
 * extension to mint registration tokens server side, see the tracking issue
 * in docs/providers.md.
 */
export const githubProvider: RunnerProvider<ProviderRequest<"github">> = {
    id: "github",
    runnerVersion: runnerVersions.github.version,
    currentImage: () => getEnvironmentVariables().RUNNER_IMAGE_GITHUB,

    async prepare(input, runnerName) {
        const target = parseGitHubTarget(input.target);
        const env = getEnvironmentVariables();

        const environment: Record<string, string> = {
            GITHUB_URL: target.url,
            GITHUB_API: env.GITHUB_API_URL,
            RUNNER_NAME: runnerName,
            RUNNER_LABELS: input.labels ?? "mittwald",
            RUNNER_TOKEN: input.token,
            RUNNER_EPHEMERAL: "false",
        };
        if (input.runnerGroup) {
            environment.RUNNER_GROUP = input.runnerGroup;
        }

        return {
            target: target.url.replace(GITHUB_HOST, ""),
            targetUrl: target.url,
            image: env.RUNNER_IMAGE_GITHUB,
            runnerVersion: runnerVersions.github.version,
            environment,
            volumes: [DATA_VOLUME_MOUNT],
            labels: input.labels ?? "mittwald",
            ephemeral: false,
        };
    },

    async release() {},
};
