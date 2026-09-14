import { getEnvironmentVariables } from "@/env.ts";
import {
    deleteApiV4Runners,
    getApiV4GroupsId,
    getApiV4ProjectsId,
    postApiV4UserRunners,
} from "@/generated/gitlab";
import { createClient } from "@/generated/gitlab/client";
import { ProviderError } from "@/global-errors.ts";
import type { MessageKey } from "@/i18n/index.ts";
import { createLogger } from "@/logger.ts";
import runnerVersions from "../../../docker/runner/versions.json";
import {
    DATA_VOLUME_MOUNT,
    type PreparedRunner,
    type ProviderRequest,
    type RunnerProvider,
} from "./types.ts";

type GitLabRequest = ProviderRequest<"gitlab">;
const log = createLogger("gitlab");
type Subject = "project" | "group" | "runner";

const accessDenied: Record<Subject, MessageKey> = {
    project: "error.gitlab.noAccessProject",
    group: "error.gitlab.noAccessGroup",
    runner: "error.gitlab.noAccessRunner",
};

const notFound: Partial<Record<Subject, MessageKey>> = {
    project: "error.gitlab.projectNotFound",
    group: "error.gitlab.groupNotFound",
};

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
    subject: Subject,
    path = "",
): ProviderError {
    if (status === 401) {
        return new ProviderError("error.gitlab.tokenInvalid", {}, "token");
    }
    if (status === 403) {
        return new ProviderError(accessDenied[subject], { path }, "token");
    }
    const notFoundKey = notFound[subject];
    if (status === 404 && notFoundKey) {
        return new ProviderError(notFoundKey, { path }, "target");
    }
    return new ProviderError("error.gitlab.status", { status: status ?? "?" });
}

/**
 * The runner is created through the API with the user's PAT. The container
 * only receives the resulting runner authentication token, never the PAT.
 * On removal the runner is deleted with that token.
 */
export const gitlabProvider: RunnerProvider<GitLabRequest> = {
    id: "gitlab",
    runnerVersion: runnerVersions.gitlab,
    concurrencyVariable: "RUNNER_CONCURRENT",
    currentImage: () => getEnvironmentVariables().RUNNER_IMAGE_GITLAB,

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
                    "error.gitlab.projectPathRequired",
                    {},
                    "target",
                );
            }
            const project = await getApiV4ProjectsId({
                client,
                path: { id: path },
            });
            if (!project.data) {
                throw describeError(project.response?.status, "project", path);
            }
            projectId = project.data.id;
            log.debug("project resolved", { instanceUrl, path, projectId });
            target = `${target} ${project.data.path_with_namespace ?? path}`;
            targetUrl = project.data.web_url ?? `${instanceUrl}/${path}`;
        } else if (input.runnerType === "group_type") {
            if (!path) {
                throw new ProviderError(
                    "error.gitlab.groupPathRequired",
                    {},
                    "target",
                );
            }
            const group = await getApiV4GroupsId({
                client,
                path: { id: path },
            });
            if (!group.data) {
                throw describeError(group.response?.status, "group", path);
            }
            groupId = group.data.id;
            log.debug("group resolved", { instanceUrl, path, groupId });
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
            log.debug("runner registration failed", {
                instanceUrl,
                runnerType: input.runnerType,
                status: created.response?.status,
            });
            throw describeError(created.response?.status, "runner");
        }
        log.info("runner registered", {
            instanceUrl,
            runnerType: input.runnerType,
            runnerId: created.data.id,
            tags,
        });

        return {
            target,
            targetUrl,
            image: env.RUNNER_IMAGE_GITLAB,
            runnerVersion: runnerVersions.gitlab,
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
            volumes: [DATA_VOLUME_MOUNT],
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
        log.info("runner registration removed", {
            instanceUrl: credentials.instanceUrl,
            runnerId: credentials.runnerId,
            status,
        });
        if (status >= 500) {
            throw new ProviderError("error.gitlab.removeFailed", { status });
        }
    },
};
