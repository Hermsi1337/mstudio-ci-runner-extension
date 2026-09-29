import { getEnvironmentVariables } from "@/env.ts";
import { ProviderError } from "@/global-errors.ts";
import runnerVersions from "../../../docker/runner/versions.json";
import {
    DATA_VOLUME_MOUNT,
    type PreparedRunner,
    type ProviderRequest,
    type RunnerProvider,
} from "./types.ts";

type ForgejoRequest = ProviderRequest<"forgejo">;

/**
 * The extension never calls the instance, so the URL only has to be a
 * well-formed https base URL. Query, fragment and credentials would end up in
 * the runner config and the stack name, so they are rejected.
 */
export function normalizeForgejoUrl(url: string): string {
    const trimmed = url.trim().replace(/\/+$/, "");
    let parsed: URL;
    try {
        parsed = new URL(trimmed);
    } catch {
        throw new ProviderError(
            "error.forgejo.instanceUrlInvalid",
            {},
            "instanceUrl",
        );
    }
    if (
        parsed.protocol !== "https:" ||
        parsed.username ||
        parsed.password ||
        parsed.search ||
        parsed.hash
    ) {
        throw new ProviderError(
            "error.forgejo.instanceUrlInvalid",
            {},
            "instanceUrl",
        );
    }

    return trimmed;
}

/**
 * The image registers every label as <label>:host. forgejo-runner reads a
 * colon as the start of the executor and a question mark as the start of
 * label options, so either character would change what the label means or
 * stop the runner from starting.
 */
export function assertForgejoLabels(labels: string): void {
    if (/[:?]/.test(labels)) {
        throw new ProviderError("error.forgejo.labelsInvalid", {}, "labels");
    }
}

/**
 * Forgejo creates the runner on its settings page and shows UUID and token
 * once. There is no registration step: the container declares itself with
 * both on every start. Verifying them means connecting as the runner, which
 * the container does seconds later, so prepare only checks the URL.
 *
 * Nothing is released. Deleting a runner in Forgejo needs a user or admin
 * token that would have to live in the runner container, so a removed runner
 * stays offline in Forgejo until someone deletes it there.
 */
export const forgejoProvider: RunnerProvider<ForgejoRequest> = {
    id: "forgejo",
    runnerVersion: runnerVersions.forgejo.version,
    concurrencyVariable: "RUNNER_CAPACITY",
    currentImage: () => getEnvironmentVariables().RUNNER_IMAGE_FORGEJO,

    async prepare(input, runnerName): Promise<PreparedRunner> {
        const env = getEnvironmentVariables();
        const instanceUrl = normalizeForgejoUrl(input.instanceUrl);
        const labels = input.labels || "mittwald";
        assertForgejoLabels(labels);

        return {
            target: instanceUrl.replace(/^https:\/\//, ""),
            targetUrl: instanceUrl,
            image: env.RUNNER_IMAGE_FORGEJO,
            runnerVersion: runnerVersions.forgejo.version,
            environment: {
                FORGEJO_INSTANCE_URL: instanceUrl,
                FORGEJO_RUNNER_UUID: input.uuid,
                FORGEJO_RUNNER_TOKEN: input.token,
                RUNNER_NAME: runnerName,
                RUNNER_LABELS: labels,
            },
            volumes: [DATA_VOLUME_MOUNT],
            labels,
            ephemeral: false,
        };
    },

    async release() {},
};
