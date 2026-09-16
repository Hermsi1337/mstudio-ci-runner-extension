import type { MittwaldAPIV2Client } from "@mittwald/api-client";
import { isBuildQueueMount, queueMountFor } from "@/build-queue.ts";
import { getEnvironmentVariables } from "@/env";
import { createLogger } from "@/logger.ts";
import { getProjectDirectory } from "./project.ts";
import {
    declareService,
    getStack,
    removeService,
    type StackResponse,
} from "./stack.ts";

/**
 * Jobs can build container images although the runner has neither a Docker
 * daemon nor the privileges kaniko alternatives need. One builder service per
 * stack runs the builds; it serves a single build and exits, because kaniko
 * unpacks the base image into its own root filesystem. restartPolicy "always"
 * brings it back with a clean one.
 *
 * Runner and builder exchange jobs through a directory in the project file
 * system, the only storage two containers of a project reliably share. The
 * directory carries the stack id, because the file system is shared by the
 * whole project. Details and the queue protocol: docs/image-builds.md.
 */
const log = createLogger("builder");

export const BUILDER_SERVICE_NAME = "builder";

const BUILDER_LIMITS = { cpus: "2", memory: "4096mb" };

export async function buildQueueMount(
    client: MittwaldAPIV2Client,
    projectId: string,
    stackId: string,
): Promise<string> {
    return queueMountFor(await getProjectDirectory(client, projectId), stackId);
}

function hasBuilder(stack: StackResponse): boolean {
    return (stack.services ?? []).some(
        (service) => service.serviceName === BUILDER_SERVICE_NAME,
    );
}

/**
 * Declares the builder of a stack unless it already runs. The service takes no
 * arguments: it polls the queue directory it shares with the runners.
 */
export async function ensureBuilder(
    client: MittwaldAPIV2Client,
    extensionInstanceId: string,
    stackId: string,
    queueMount: string,
): Promise<void> {
    const stack = await getStack(client, stackId);
    if (stack && hasBuilder(stack)) {
        log.debug("builder already declared", { stackId });

        return;
    }
    await declareService(
        client,
        extensionInstanceId,
        stackId,
        BUILDER_SERVICE_NAME,
        {
            description: "Image builder",
            image: getEnvironmentVariables().BUILDER_IMAGE,
            restartPolicy: "always",
            deploy: { resources: { limits: BUILDER_LIMITS } },
            volumes: [queueMount],
        },
    );
    log.info("builder declared", { stackId });
}

/**
 * Removes the builder once the last runner of the stack stops building images.
 * `ignoreServiceName` covers the runner whose declaration is not visible yet,
 * for example while it is being deleted.
 */
export async function removeBuilderIfUnused(
    client: MittwaldAPIV2Client,
    extensionInstanceId: string,
    stackId: string,
    ignoreServiceName?: string,
): Promise<void> {
    const stack = await getStack(client, stackId);
    if (!stack || !hasBuilder(stack)) {
        return;
    }
    const stillBuilding = (stack.services ?? []).some((service) => {
        if (
            service.serviceName === BUILDER_SERVICE_NAME ||
            service.serviceName === ignoreServiceName
        ) {
            return false;
        }
        const state = service.pendingState ?? service.deployedState;

        return (state?.volumes ?? []).some(isBuildQueueMount);
    });
    if (stillBuilding) {
        log.debug("builder stays, another runner builds images", { stackId });

        return;
    }
    await removeService(
        client,
        extensionInstanceId,
        stackId,
        BUILDER_SERVICE_NAME,
    );
    log.info("builder removed", { stackId });
}
