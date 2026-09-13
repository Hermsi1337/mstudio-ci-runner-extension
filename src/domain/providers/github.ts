import { RequestError } from "@octokit/request-error";
import { Octokit } from "@octokit/rest";
import { getEnvironmentVariables } from "@/env.ts";
import { ProviderError } from "@/global-errors.ts";
import { createLogger } from "@/logger.ts";
import type { ProviderRequest, RunnerProvider } from "./types.ts";

const log = createLogger("github");

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

export async function assertGitHubRunnerAccess(
    token: string,
    target: GitHubTarget,
): Promise<void> {
    const octokit = new Octokit({
        auth: token,
        baseUrl: getEnvironmentVariables().GITHUB_API_URL,
        userAgent: "mstudio-ci-runner-extension",
    });
    const headers = { accept: "application/json" };

    try {
        if (target.scope === "repo") {
            await octokit.rest.actions.listSelfHostedRunnersForRepo({
                owner: target.owner,
                repo: target.repo,
                per_page: 1,
                headers,
            });
        } else {
            await octokit.rest.actions.listSelfHostedRunnersForOrg({
                org: target.org,
                per_page: 1,
                headers,
            });
        }
        log.debug("runner access confirmed", { target: target.url });
    } catch (error) {
        log.debug("runner access check failed", {
            target: target.url,
            status: error instanceof RequestError ? error.status : undefined,
            error,
        });
        if (!(error instanceof RequestError)) {
            throw new ProviderError("error.github.unreachable", {
                reason: (error as Error).message,
            });
        }
        if (error.status === 401) {
            throw new ProviderError("error.github.tokenInvalid", {}, "token");
        }
        if (error.status === 403 || error.status === 404) {
            throw target.scope === "repo"
                ? new ProviderError(
                      "error.github.noAccessRepo",
                      { owner: target.owner, repo: target.repo },
                      "token",
                  )
                : new ProviderError(
                      "error.github.noAccessOrg",
                      { org: target.org },
                      "token",
                  );
        }
        throw new ProviderError("error.github.status", {
            status: error.status,
        });
    }
}

/**
 * The container fetches a registration token with the PAT on every start and
 * deregisters itself on shutdown, so there is no provider-side cleanup.
 */
export const githubProvider: RunnerProvider<ProviderRequest<"github">> = {
    id: "github",

    async prepare(input, runnerName) {
        const target = parseGitHubTarget(input.target);
        await assertGitHubRunnerAccess(input.token, target);
        const env = getEnvironmentVariables();

        const environment: Record<string, string> = {
            GITHUB_URL: target.url,
            GITHUB_API: env.GITHUB_API_URL,
            GITHUB_TOKEN: input.token,
            RUNNER_NAME: runnerName,
            RUNNER_LABELS: input.labels ?? "mittwald",
            RUNNER_EPHEMERAL: input.ephemeral ? "true" : "false",
        };
        if (input.runnerGroup) {
            environment.RUNNER_GROUP = input.runnerGroup;
        }

        return {
            target: target.url.replace(GITHUB_HOST, ""),
            targetUrl: target.url,
            image: env.RUNNER_IMAGE_GITHUB,
            environment,
            credentials: { token: input.token },
            volumes: ["work:/home/runner/_work"],
            ephemeral: input.ephemeral ?? false,
        };
    },

    async release() {},
};
