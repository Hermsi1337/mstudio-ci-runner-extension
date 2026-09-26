import type { MittwaldAPIV2Client } from "@mittwald/api-client";
import { eq, sql } from "drizzle-orm";
import { imageMatches, imageRepository } from "@/build-queue.ts";
import { getDatabase } from "@/db";
import { dockerApiStacks, extensionInstances } from "@/db/schema.ts";
import {
    DOCKER_API_CONTAINER_PREFIX,
    DOCKER_API_SERVICE_NAME,
    generateSecret,
    hashSecret,
    secretMatches,
    stateMountFor,
    tokenUrlFor,
    usesDockerApi,
} from "@/docker-api.ts";
import { getEnvironmentVariables } from "@/env";
import {
    DockerApiNameTakenError,
    DockerApiUnconfiguredError,
} from "@/global-errors.ts";
import { createLogger } from "@/logger.ts";
import { createMittwaldClient } from "@/mittwald/client.ts";
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
 * Jobs can run containers although the runner has no Docker daemon. The
 * service `docker` of a stack speaks the Docker Engine API and runs every
 * container as a service of the same stack (docker/docker-api,
 * docs/docker-api.md). Runners reach it through DOCKER_HOST.
 *
 * The service needs a mittwald token. It gets short-lived instance tokens from
 * this extension, authenticated with a random secret per stack whose SHA-256
 * the database keeps, so no user token ever sits in a container.
 */
const log = createLogger("docker-api");

const DOCKER_API_LIMITS = { cpus: "0.5", memory: "512mb" };

function findDockerApi(stack: StackResponse): ServiceResponse | undefined {
    return (stack.services ?? []).find(
        (service) => service.serviceName === DOCKER_API_SERVICE_NAME,
    );
}

/**
 * A stack the user picked may already have a container called `docker`. That
 * one belongs to the user and is never replaced or removed.
 */
function isOurDockerApi(service: ServiceResponse): boolean {
    const image = (service.pendingState ?? service.deployedState)?.image;
    const repository = imageRepository(
        getEnvironmentVariables().DOCKER_API_IMAGE,
    );

    return (
        image !== undefined && imageMatches(imageRepository(image), repository)
    );
}

function isAdapterContainer(service: ServiceResponse): boolean {
    return service.description.startsWith(DOCKER_API_CONTAINER_PREFIX);
}

/**
 * Serializes declaring and removing the service `docker` of one stack across
 * requests and extension replicas. Without it, a runner that turns the option
 * off could remove the service while a sibling in the same stack turns it on.
 * The transaction only holds the lock; the work uses its own connections.
 */
async function withStackLock<T>(
    stackId: string,
    work: () => Promise<T>,
): Promise<T> {
    return getDatabase().transaction(async (tx) => {
        await tx.execute(
            sql`select pg_advisory_xact_lock(hashtext(${`docker-api:${stackId}`}))`,
        );

        return work();
    });
}

/**
 * Refuses a stack whose `docker` service belongs to someone else. Runs before
 * the runner gets DOCKER_HOST, so a refusal leaves the runner untouched.
 */
export async function assertDockerApiNameFree(
    client: MittwaldAPIV2Client,
    stackId: string,
): Promise<void> {
    const stack = await getStack(client, stackId);
    const existing = stack ? findDockerApi(stack) : undefined;
    if (existing && !isOurDockerApi(existing)) {
        throw new DockerApiNameTakenError(stackId);
    }
}

/** Fails early, before the runner is declared, when the option cannot work. */
export function assertDockerApiAvailable(): void {
    if (!getEnvironmentVariables().PUBLIC_URL) {
        throw new DockerApiUnconfiguredError();
    }
}

/**
 * Declares the service `docker` of a stack, and redeclares it when its image
 * is behind this release, its environment changed or its secret does not match
 * the stored hash. A redeclaration always gets a new secret; the old one stops
 * working with the stored hash, and the service is recreated anyway.
 */
export async function ensureDockerApi(
    client: MittwaldAPIV2Client,
    extensionInstanceId: string,
    projectId: string,
    stackId: string,
): Promise<void> {
    await withStackLock(stackId, () =>
        declareDockerApi(client, extensionInstanceId, projectId, stackId),
    );
}

async function declareDockerApi(
    client: MittwaldAPIV2Client,
    extensionInstanceId: string,
    projectId: string,
    stackId: string,
): Promise<void> {
    const env = getEnvironmentVariables();
    if (!env.PUBLIC_URL) {
        throw new DockerApiUnconfiguredError();
    }
    const stack = await getStack(client, stackId);
    const existing = stack ? findDockerApi(stack) : undefined;
    if (existing && !isOurDockerApi(existing)) {
        throw new DockerApiNameTakenError(stackId);
    }
    const settings = {
        MITTWALD_PROJECT_ID: projectId,
        MITTWALD_STACK_ID: stackId,
        DOCKER_API_TOKEN_URL: tokenUrlFor(env.PUBLIC_URL),
    };
    if (existing) {
        const state = existing.pendingState ?? existing.deployedState;
        const current = state?.envs ?? {};
        const [row] = await getDatabase()
            .select({ secretHash: dockerApiStacks.secretHash })
            .from(dockerApiStacks)
            .where(eq(dockerApiStacks.stackId, stackId));
        if (
            imageMatches(state?.image, env.DOCKER_API_IMAGE) &&
            Object.entries(settings).every(
                ([key, value]) => current[key] === value,
            ) &&
            row !== undefined &&
            current.DOCKER_API_SECRET !== undefined &&
            secretMatches(row.secretHash, current.DOCKER_API_SECRET)
        ) {
            log.debug("docker api already declared", { stackId });

            return;
        }
        log.info("docker api is behind, redeclaring", {
            stackId,
            from: state?.image,
            to: env.DOCKER_API_IMAGE,
        });
    }
    // The hash goes first: a crash between the two leaves a service whose
    // secret does not match, which the next call notices and replaces.
    const secret = generateSecret();
    await getDatabase()
        .insert(dockerApiStacks)
        .values({
            stackId,
            extensionInstanceId,
            projectId,
            secretHash: hashSecret(secret),
        })
        .onConflictDoUpdate({
            target: dockerApiStacks.stackId,
            set: { secretHash: hashSecret(secret) },
        });
    await declareService(
        client,
        extensionInstanceId,
        stackId,
        DOCKER_API_SERVICE_NAME,
        {
            description: "Docker API for jobs",
            image: env.DOCKER_API_IMAGE,
            restartPolicy: "always",
            deploy: { resources: { limits: DOCKER_API_LIMITS } },
            environment: { ...settings, DOCKER_API_SECRET: secret },
            volumes: [
                stateMountFor(
                    await getProjectDirectory(client, projectId),
                    stackId,
                ),
            ],
        },
    );
    if (existing) {
        await recreateService(
            client,
            extensionInstanceId,
            stackId,
            existing.id,
        );
    }
    log.info("docker api declared", { stackId, image: env.DOCKER_API_IMAGE });
}

/**
 * Removes the service `docker` once no runner of the stack uses it any more,
 * together with the containers it started for jobs. `ignoreServiceName`
 * covers the runner whose change is not visible yet.
 */
export async function removeDockerApiIfUnused(
    client: MittwaldAPIV2Client,
    extensionInstanceId: string,
    stackId: string,
    ignoreServiceName?: string,
): Promise<void> {
    await withStackLock(stackId, () =>
        removeIfUnused(client, extensionInstanceId, stackId, ignoreServiceName),
    );
}

async function removeIfUnused(
    client: MittwaldAPIV2Client,
    extensionInstanceId: string,
    stackId: string,
    ignoreServiceName?: string,
): Promise<void> {
    const stack = await getStack(client, stackId);
    const dockerApi = stack ? findDockerApi(stack) : undefined;
    if (!stack || !dockerApi || !isOurDockerApi(dockerApi)) {
        await forgetStack(stackId);

        return;
    }
    const stillUsed = (stack.services ?? []).some((service) => {
        if (
            service.serviceName === DOCKER_API_SERVICE_NAME ||
            service.serviceName === ignoreServiceName ||
            isAdapterContainer(service)
        ) {
            return false;
        }
        const state = service.pendingState ?? service.deployedState;

        return usesDockerApi(state?.envs);
    });
    if (stillUsed) {
        log.debug("docker api stays, another runner uses it", { stackId });

        return;
    }
    await removeDockerApi(client, extensionInstanceId, stack);
}

/**
 * The containers go first: without the service `docker` nobody would remove
 * them any more.
 */
export async function removeDockerApi(
    client: MittwaldAPIV2Client,
    extensionInstanceId: string,
    stack: StackResponse,
): Promise<void> {
    const containers = (stack.services ?? []).filter(isAdapterContainer);
    for (const container of containers) {
        await removeService(
            client,
            extensionInstanceId,
            stack.id,
            container.serviceName,
        );
    }
    const dockerApi = findDockerApi(stack);
    if (dockerApi && isOurDockerApi(dockerApi)) {
        await removeService(
            client,
            extensionInstanceId,
            stack.id,
            DOCKER_API_SERVICE_NAME,
        );
    }
    await forgetStack(stack.id);
    log.info("docker api removed", {
        stackId: stack.id,
        containers: containers.length,
    });
}

async function forgetStack(stackId: string): Promise<void> {
    await getDatabase()
        .delete(dockerApiStacks)
        .where(eq(dockerApiStacks.stackId, stackId));
}

export class DockerApiTokenDenied extends Error {}

export class DockerApiTokenUnavailable extends Error {}

export interface DockerApiToken {
    token: string;
    expiresAt: string;
}

/**
 * Issues an access token of the extension instance to the service `docker`
 * of a stack. The secret must match the stack. The row exists exactly as long
 * as the extension keeps the service, so a removed service gets nothing. The
 * runner row is not consulted: the service starts before it is written.
 */
export async function issueDockerApiToken(
    stackId: string,
    presentedSecret: string,
): Promise<DockerApiToken> {
    const [row] = await getDatabase()
        .select()
        .from(dockerApiStacks)
        .where(eq(dockerApiStacks.stackId, stackId));
    if (!row || !secretMatches(row.secretHash, presentedSecret)) {
        log.warn("docker api token refused, secret does not match", {
            stackId,
            known: Boolean(row),
        });
        throw new DockerApiTokenDenied();
    }
    const [instance] = await getDatabase()
        .select({ secret: extensionInstances.secret })
        .from(extensionInstances)
        .where(eq(extensionInstances.id, row.extensionInstanceId));
    if (!instance?.secret) {
        log.warn("docker api token refused, instance has no secret", {
            stackId,
        });
        throw new DockerApiTokenDenied();
    }
    const auth =
        await createMittwaldClient().marketplace.extensionAuthenticateInstance({
            extensionInstanceId: row.extensionInstanceId,
            data: { extensionInstanceSecret: instance.secret },
        });
    if (auth.status !== 201) {
        log.error("instance authentication for docker api failed", {
            stackId,
            status: auth.status,
        });
        throw new DockerApiTokenUnavailable();
    }
    log.debug("docker api token issued", {
        stackId,
        expiresAt: auth.data.expiry,
    });

    // Normalized to UTC, the response schema accepts no offsets.
    return {
        token: auth.data.publicToken,
        expiresAt: new Date(auth.data.expiry).toISOString(),
    };
}
