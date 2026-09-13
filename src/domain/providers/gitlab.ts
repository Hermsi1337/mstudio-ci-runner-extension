import { getEnvironmentVariables } from "@/env.ts";
import {
    deleteApiV4Runners,
    getApiV4GroupsId,
    getApiV4ProjectsId,
    postApiV4UserRunners,
} from "@/generated/gitlab";
import { createClient } from "@/generated/gitlab/client";
import { ProviderError } from "@/global-errors.ts";
import type {
    PreparedRunner,
    ProviderRequest,
    RunnerProvider,
} from "./types.ts";

type GitLabRequest = ProviderRequest<"gitlab">;

function gitlabClient(instanceUrl: string, token?: string) {
    return createClient({
        baseUrl: getEnvironmentVariables().GITLAB_API_URL ?? instanceUrl,
        headers: token ? { "PRIVATE-TOKEN": token } : undefined,
    });
}

function normalizeInstanceUrl(url: string): string {
    return url.trim().replace(/\/+$/, "");
}

function normalizePath(path: string | undefined): string {
    return (path ?? "").trim().replace(/^\/+|\/+$/g, "");
}

function describeError(
    status: number | undefined,
    what: string,
): ProviderError {
    if (status === 401) {
        return new ProviderError("The GitLab token is invalid.", "token");
    }
    if (status === 403) {
        return new ProviderError(
            `The token cannot manage ${what}. Required scopes: create_runner and api (owner or maintainer).`,
            "token",
        );
    }
    if (status === 404) {
        return new ProviderError(`${what} was not found.`, "target");
    }
    return new ProviderError(`GitLab responded with status ${status ?? "?"}.`);
}

/**
 * The runner is created through the API with the user's PAT. The container
 * only receives the resulting runner authentication token, never the PAT.
 * On removal the runner is deleted with that token.
 */
export const gitlabProvider: RunnerProvider<GitLabRequest> = {
    id: "gitlab",

    async prepare(input, runnerName): Promise<PreparedRunner> {
        const env = getEnvironmentVariables();
        const instanceUrl = normalizeInstanceUrl(input.instanceUrl);
        const path = normalizePath(input.target);
        const client = gitlabClient(instanceUrl, input.token);
        const tags = (input.labels ?? "")
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean);

        let projectId: number | undefined;
        let groupId: number | undefined;
        let target = instanceUrl.replace(/^https?:\/\//, "");
        let targetUrl = instanceUrl;

        if (input.runnerType === "project_type") {
            if (!path) {
                throw new ProviderError(
                    "Project path is required (e.g. group/project).",
                    "target",
                );
            }
            const project = await getApiV4ProjectsId({
                client,
                path: { id: path },
            });
            if (!project.data) {
                throw describeError(
                    project.response?.status,
                    `project ${path}`,
                );
            }
            projectId = project.data.id;
            target = `${target} ${project.data.path_with_namespace ?? path}`;
            targetUrl = project.data.web_url ?? `${instanceUrl}/${path}`;
        } else if (input.runnerType === "group_type") {
            if (!path) {
                throw new ProviderError("Group path is required.", "target");
            }
            const group = await getApiV4GroupsId({
                client,
                path: { id: path },
            });
            if (!group.data) {
                throw describeError(group.response?.status, `group ${path}`);
            }
            groupId = group.data.id;
            target = `${target} ${group.data.full_path ?? path}`;
            targetUrl = group.data.web_url ?? `${instanceUrl}/groups/${path}`;
        }

        const created = await postApiV4UserRunners({
            client,
            body: {
                runner_type: input.runnerType,
                project_id: projectId,
                group_id: groupId,
                description: runnerName,
                tag_list: tags,
                run_untagged: input.runUntagged ?? true,
            },
        });
        if (!created.data) {
            throw describeError(created.response?.status, "the runner");
        }

        return {
            target,
            targetUrl,
            image: env.RUNNER_IMAGE_GITLAB,
            environment: {
                CI_SERVER_URL: instanceUrl,
                CI_SERVER_TOKEN: created.data.token,
                RUNNER_NAME: runnerName,
            },
            credentials: {
                instanceUrl,
                runnerId: created.data.id,
                runnerToken: created.data.token,
            },
            volumes: ["builds:/home/runner/builds", "cache:/home/runner/cache"],
            ephemeral: false,
        };
    },

    async release(credentials) {
        if (!credentials.runnerToken || !credentials.instanceUrl) {
            return;
        }
        const result = await deleteApiV4Runners({
            client: gitlabClient(credentials.instanceUrl),
            query: { token: credentials.runnerToken },
        });
        const status = result.response?.status ?? 0;
        if (status >= 500) {
            throw new ProviderError(
                `The GitLab runner could not be removed (status ${status}).`,
            );
        }
    },
};
