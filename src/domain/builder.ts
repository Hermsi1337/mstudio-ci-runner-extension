import type { MittwaldAPIV2Client } from "@mittwald/api-client";
import { isBuildQueueMount, queueMountFor } from "@/build-queue.ts";
import { getEnvironmentVariables } from "@/env";
import { createLogger } from "@/logger.ts";
import { getProjectDirectory } from "./project.ts";
import {
    declareService,
    getStack,
    recreateService,
    removeService,
    type ServiceResponse,
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

function findBuilder(stack: StackResponse): ServiceResponse | undefined {
    return (stack.services ?? []).find(
        (service) => service.serviceName === BUILDER_SERVICE_NAME,
    );
}

function hasBuilder(stack: StackResponse): boolean {
    return findBuilder(stack) !== undefined;
}

/**
 * Declares the builder of a stack, and redeclares it when its image is behind
 * the one this release ships. A runner update would otherwise leave the builder
 * on the version it was created with. The service takes no arguments: it polls
 * the queue directory it shares with the runners.
 */
export async function ensureBuilder(
    client: MittwaldAPIV2Client,
    extensionInstanceId: string,
    stackId: string,
    queueMount: string,
): Promise<void> {
    const image = getEnvironmentVariables().BUILDER_IMAGE;
    const stack = await getStack(client, stackId);
    const existing = stack ? findBuilder(stack) : undefined;
    if (existing) {
        const state = existing.pendingState ?? existing.deployedState;
        if (imageMatches(state?.image, image)) {
            log.debug("builder already declared", { stackId });

            return;
        }
        log.info("builder image is behind, redeclaring", {
            stackId,
            from: state?.image,
            to: image,
        });
    }
    await declareService(
        client,
        extensionInstanceId,
        stackId,
        BUILDER_SERVICE_NAME,
        {
            description: "Image builder",
            image,
            restartPolicy: "always",
            deploy: { resources: { limits: BUILDER_LIMITS } },
            volumes: [queueMount],
        },
    );
    if (existing) {
        await recreateService(client, extensionInstanceId, stackId, existing.id);
    }
    log.info("builder declared", { stackId, image });
}

/**
 * mittwald reports the image of a service normalized ("library/alpine:3.20"
 * for "alpine:3.20"), so a plain comparison would redeclare on every call.
 */
function imageMatches(deployed: string | undefined, configured: string): boolean {
    if (!deployed) {
        return false;
    }

    return deployed === configured || configured.endsWith(`/${deployed}`);
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
