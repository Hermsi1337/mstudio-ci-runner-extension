import { getEnvironmentVariables } from "@/env.ts";
import { deleteApiV4Runners, postApiV4RunnersVerify } from "@/generated/gitlab";
import { createClient } from "@/generated/gitlab/client";
import { ProviderError } from "@/global-errors.ts";
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

function gitlabClient(instanceUrl: string) {
    return createClient({
        baseUrl: getEnvironmentVariables().GITLAB_API_URL ?? instanceUrl,
    });
}

/**
 * The instance URL is user input that becomes an outbound request target, so
 * it must be a public https host. Rejecting other schemes and private,
 * loopback and link-local addresses keeps it from reaching services inside
 * the extension's own network (SSRF).
 */
function normalizeInstanceUrl(url: string): string {
    const trimmed = url.trim().replace(/\/+$/, "");
    let parsed: URL;
    try {
        parsed = new URL(trimmed);
    } catch {
        throw new ProviderError(
            "error.gitlab.instanceUrlInvalid",
            {},
            "instanceUrl",
        );
    }
    if (parsed.protocol !== "https:" || isBlockedHost(parsed.hostname)) {
        throw new ProviderError(
            "error.gitlab.instanceUrlInvalid",
            {},
            "instanceUrl",
        );
    }

    return trimmed;
}

function isBlockedHost(hostname: string): boolean {
    const host = hostname.replace(/^\[|\]$/g, "").toLowerCase();
    if (
        host === "localhost" ||
        host.endsWith(".localhost") ||
        host.endsWith(".internal") ||
        host.endsWith(".local")
    ) {
        return true;
    }
    if (!host.includes(".") && !host.includes(":")) {
        return true;
    }
    const v4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (v4) {
        const [a, b] = v4.slice(1).map(Number);
        if (
            a === 10 ||
            a === 127 ||
            (a === 192 && b === 168) ||
            (a === 172 && b >= 16 && b <= 31) ||
            (a === 169 && b === 254) ||
            a === 0
        ) {
            return true;
        }
    }
    if (
        host === "::1" ||
        host.startsWith("fc") ||
        host.startsWith("fd") ||
        host.startsWith("fe80")
    ) {
        return true;
    }

    return false;
}

interface Registration {
    target: string;
    targetUrl: string;
    runnerId: string;
    runnerToken: string;
}

/**
 * The runner token from the "New runner" page already belongs to a runner
 * whose scope and tags live in GitLab. Verifying it needs no PAT and yields
 * the runner id; scope and tags are not readable with the runner token.
 */
async function verifyRunnerToken(
    instanceUrl: string,
    token: string,
): Promise<Registration> {
    const verified = await postApiV4RunnersVerify({
        client: gitlabClient(instanceUrl),
        body: { token },
    });
    if (!verified.data) {
        const status = verified.response?.status;
        log.debug("runner token verification failed", { instanceUrl, status });
        // Only 401/403 mean the token is actually wrong; a 5xx or a missing
        // response means GitLab is unreachable, not that the user mistyped.
        if (status !== undefined && status !== 401 && status !== 403) {
            throw new ProviderError("error.gitlab.status", { status });
        }
        throw new ProviderError(
            "error.gitlab.runnerTokenInvalid",
            {},
            "configCommand",
        );
    }
    log.info("runner token verified", {
        instanceUrl,
        runnerId: verified.data.id,
    });
    return {
        target: instanceUrl.replace(/^https?:\/\//, ""),
        targetUrl: instanceUrl,
        runnerId: String(verified.data.id),
        runnerToken: token,
    };
}

/**
 * The container registers with a runner that already exists in GitLab, so the
 * extension never needs a personal access token. Scope and tags belong to the
 * runner in GitLab; on removal the registration is deleted with the runner
 * token from the container.
 */
export const gitlabProvider: RunnerProvider<GitLabRequest> = {
    id: "gitlab",
    runnerVersion: runnerVersions.gitlab.version,
    concurrencyVariable: "RUNNER_CONCURRENT",
    currentImage: () => getEnvironmentVariables().RUNNER_IMAGE_GITLAB,

    async prepare(input, runnerName): Promise<PreparedRunner> {
        const env = getEnvironmentVariables();
        const instanceUrl = normalizeInstanceUrl(input.instanceUrl);
        const registration = await verifyRunnerToken(instanceUrl, input.token);

        return {
            target: registration.target,
            targetUrl: registration.targetUrl,
            image: env.RUNNER_IMAGE_GITLAB,
            runnerVersion: runnerVersions.gitlab.version,
            environment: {
                CI_SERVER_URL: instanceUrl,
                CI_SERVER_TOKEN: registration.runnerToken,
                RUNNER_NAME: runnerName,
            },
            volumes: [DATA_VOLUME_MOUNT],
            labels: "",
            ephemeral: false,
        };
    },

    async release(environment) {
        const instanceUrl = environment.CI_SERVER_URL;
        const runnerToken = environment.CI_SERVER_TOKEN;
        if (!instanceUrl || !runnerToken) {
            log.warn(
                "runner registration not removed, container environment has no token",
            );
            return;
        }
        const result = await deleteApiV4Runners({
            client: gitlabClient(instanceUrl),
            query: { token: runnerToken },
        });
        const status = result.response?.status ?? 0;
        // 204 removed, 404 already gone. Anything else (including 403 on a
        // rotated token and a missing response) means the registration may
        // still exist, so surface it instead of logging a false success.
        if (status === 204 || status === 404) {
            log.info("runner registration removed", { instanceUrl, status });
            return;
        }

        throw new ProviderError("error.gitlab.removeFailed", { status });
    },
};
