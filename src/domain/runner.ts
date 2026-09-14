import { assertStatus, type MittwaldAPIV2Client } from "@mittwald/api-client";
import { desc, eq } from "drizzle-orm";
import * as uuid from "uuid";
import { getDatabase } from "@/db";
import { type NewRunnerRow, type RunnerRow, runners } from "@/db/schema.ts";
import type {
    ConfigureRunnerRequest,
    CreateRunnerRequest,
    Provider,
    Runner,
    RunnerSize,
} from "@/generated/extension-api";
import {
    NotFoundError,
    PermissionsInsufficientError,
    UpstreamError,
} from "@/global-errors.ts";
import { addLogContext, createLogger } from "@/logger.ts";
import { runnerSizes } from "@/runner-sizes.ts";
import {
    CACHE_VOLUME,
    cacheTrimCronjob,
    withCache,
    withoutCache,
} from "./cache.ts";
import {
    getProvider,
    getProviderById,
    type RunnerProvider,
} from "./providers/index.ts";
import {
    declareService,
    deleteStackIfEmpty,
    deleteVolumes,
    findOrCreateStack,
    getStack,
    prefixMounts,
    removeService,
    type ServiceResponse,
    type StackResponse,
    uniqueServiceName,
    unprefixMounts,
} from "./stack.ts";

const log = createLogger("runner");

export interface RunnerResources {
    size: RunnerSize;
    cpus: number;
    memoryMb: number;
}

/**
 * Presets carry their limits in code, custom sizes carry them in the request or
 * the row. A custom size without both values falls back to medium.
 */
export function resolveResources(input: {
    size?: RunnerSize | string | null;
    cpus?: number | null;
    memoryMb?: number | null;
}): RunnerResources {
    if (input.size === "custom" && input.cpus && input.memoryMb) {
        return { size: "custom", cpus: input.cpus, memoryMb: input.memoryMb };
    }
    const size =
        input.size && input.size in runnerSizes
            ? (input.size as keyof typeof runnerSizes)
            : "medium";
    return { size, ...runnerSizes[size] };
}

function resourceLimits(resources: RunnerResources): {
    cpus: string;
    memory: string;
} {
    return {
        cpus: String(resources.cpus),
        memory: `${resources.memoryMb}mb`,
    };
}

const STUDIO_URL = "https://studio.mittwald.de";

function studioUrl(row: RunnerRow, serviceId: string | null): string | null {
    return serviceId
        ? `${STUDIO_URL}/projects/${row.projectId}/container/stacks/${row.stackId}/container/${serviceId}/general`
        : null;
}

function toView(row: RunnerRow, service?: ServiceResponse | null): Runner {
    const provider = getProviderById(row.provider);
    const image = row.image ?? service?.deployedState.image ?? null;
    const currentImage = provider?.currentImage() ?? null;
    const serviceId = row.serviceId ?? service?.id ?? null;
    const resources = resolveResources(row);
    return {
        id: row.id,
        provider: row.provider as Provider,
        name: row.name,
        target: row.target,
        targetUrl: row.targetUrl,
        labels: row.labels.split(",").filter(Boolean),
        ephemeral: row.ephemeral,
        tokenType: row.tokenType === "pat" ? "pat" : "registration",
        size: resources.size,
        cpus: resources.cpus,
        memoryMb: resources.memoryMb,
        cache: row.cache,
        cacheSizeGb: row.cacheSizeGb,
        concurrency: row.concurrency,
        stackId: row.stackId,
        serviceId,
        studioUrl: studioUrl(row, serviceId),
        status: service === null ? "missing" : (service?.status ?? "unknown"),
        statusMessage: service?.message ?? null,
        image,
        runnerVersion: row.runnerVersion ?? null,
        latestRunnerVersion: provider?.runnerVersion ?? "",
        updateAvailable:
            image !== null && currentImage !== null && image !== currentImage,
        createdAt: row.createdAt.toISOString(),
    };
}

function slugify(name: string): string {
    return name
        .toLowerCase()
        .replace(/[^a-z0-9-]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 40);
}

function parseCronjobIds(row: RunnerRow): string[] {
    try {
        const parsed = JSON.parse(row.cronjobIds) as unknown;
        return Array.isArray(parsed) ? parsed.filter(isString) : [];
    } catch {
        return [];
    }
}

function isString(value: unknown): value is string {
    return typeof value === "string";
}

async function deleteCronjobs(
    client: MittwaldAPIV2Client,
    cronjobIds: string[],
): Promise<void> {
    for (const cronjobId of cronjobIds) {
        try {
            await client.cronjob.deleteCronjob({ cronjobId });
        } catch (error) {
            log.warn("cronjob deletion failed", { cronjobId, error });
        }
    }
}

function parseCredentials(row: RunnerRow): Record<string, string> {
    try {
        return JSON.parse(row.credentials) as Record<string, string>;
    } catch {
        return {};
    }
}

function withConcurrency(
    provider: RunnerProvider,
    environment: Record<string, string>,
    concurrency: number,
): Record<string, string> {
    if (!provider.concurrencyVariable) {
        return environment;
    }
    return {
        ...environment,
        [provider.concurrencyVariable]: String(concurrency),
    };
}

async function createTrimCronjob(
    client: MittwaldAPIV2Client,
    row: Pick<NewRunnerRow, "projectId" | "stackId" | "name">,
    serviceId: string,
    sizeGb: number,
): Promise<string> {
    const cronjob = cacheTrimCronjob(sizeGb);
    const created = await client.cronjob.createCronjob({
        projectId: row.projectId,
        data: {
            description: `${cronjob.description} (${row.name})`,
            interval: cronjob.interval,
            active: true,
            timeout: cronjob.timeoutSeconds,
            concurrencyPolicy: "forbid",
            target: {
                stackId: row.stackId,
                serviceIdentifier: serviceId,
                command: cronjob.command,
            },
        },
    });
    if (created.status !== 201) {
        throw new UpstreamError("error.upstream.cronjobCreate", {
            status: created.status,
        });
    }
    log.debug("cronjob created", {
        cronjobId: created.data.id,
        interval: cronjob.interval,
    });
    return created.data.id;
}

async function updateTrimCronjob(
    client: MittwaldAPIV2Client,
    row: Pick<RunnerRow, "stackId" | "name">,
    serviceId: string,
    cronjobId: string,
    sizeGb: number,
): Promise<void> {
    const cronjob = cacheTrimCronjob(sizeGb);
    const updated = await client.cronjob.updateCronjob({
        cronjobId,
        data: {
            description: `${cronjob.description} (${row.name})`,
            target: {
                stackId: row.stackId,
                serviceIdentifier: serviceId,
                command: cronjob.command,
            },
        },
    });
    if (updated.status !== 204) {
        throw new UpstreamError("error.upstream.cronjobUpdate", {
            status: updated.status,
        });
    }
    log.debug("cronjob updated", { cronjobId, sizeGb });
}

async function findRunner(
    extensionInstanceId: string,
    runnerId: string,
): Promise<RunnerRow> {
    const [row] = await getDatabase()
        .select()
        .from(runners)
        .where(eq(runners.id, runnerId));
    if (!row || row.extensionInstanceId !== extensionInstanceId) {
        throw new NotFoundError("runner");
    }
    return row;
}

/**
 * Null when the stack or the service is gone (deleted in mStudio), undefined
 * when mittwald did not answer.
 */
async function fetchService(
    client: MittwaldAPIV2Client,
    row: RunnerRow,
): Promise<ServiceResponse | null | undefined> {
    const stack = await getStack(client, row.stackId);
    if (!stack) {
        return stack;
    }
    return serviceOf(stack, row);
}

function serviceOf(
    stack: StackResponse,
    row: Pick<RunnerRow, "serviceId" | "serviceName">,
): ServiceResponse | null {
    return (
        stack.services?.find(
            (s) =>
                s.serviceName === row.serviceName ||
                (row.serviceId !== null && s.id === row.serviceId),
        ) ?? null
    );
}

export async function listRunners(
    client: MittwaldAPIV2Client,
    extensionInstanceId: string,
): Promise<Runner[]> {
    const rows = await getDatabase()
        .select()
        .from(runners)
        .where(eq(runners.extensionInstanceId, extensionInstanceId))
        .orderBy(desc(runners.createdAt));

    const stacks = new Map(
        await Promise.all(
            [...new Set(rows.map((row) => row.stackId))].map(
                async (stackId) =>
                    [stackId, await getStack(client, stackId)] as const,
            ),
        ),
    );
    return rows.map((row) => {
        const stack = stacks.get(row.stackId);
        const service = stack ? serviceOf(stack, row) : stack;
        return toView(row, service);
    });
}

export async function createRunner(
    client: MittwaldAPIV2Client,
    extensionInstanceId: string,
    projectId: string,
    userId: string,
    input: CreateRunnerRequest,
): Promise<Runner> {
    const provider = getProvider(input);
    const resources = resolveResources(input);
    const labels = (input.labels ?? "mittwald")
        .split(",")
        .map((l) => l.trim())
        .filter(Boolean)
        .join(",");
    const runnerName = slugify(input.name) || `runner-${uuid.v4().slice(0, 8)}`;

    addLogContext({ provider: provider.id, projectId });
    log.info("creating runner", {
        name: input.name,
        runnerName,
        size: resources.size,
        cpus: resources.cpus,
        memoryMb: resources.memoryMb,
    });
    const prepared = await provider.prepare({ ...input, labels }, runnerName);
    const cache = input.cache ?? false;
    const cacheSizeGb = input.cacheSizeGb ?? 10;
    const concurrency = provider.concurrencyVariable
        ? (input.concurrency ?? 1)
        : 1;
    const { environment, mounts } = cache
        ? withCache(prepared.environment, prepared.volumes)
        : withoutCache(prepared.environment, prepared.volumes);
    log.debug("provider prepared runner", {
        target: prepared.target,
        image: prepared.image,
        environmentKeys: Object.keys(environment),
        volumes: mounts,
    });

    let stackId: string;
    try {
        stackId = (
            await findOrCreateStack(
                client,
                extensionInstanceId,
                projectId,
                prepared.targetUrl,
                `CI Runner: ${prepared.target}`,
            )
        ).stackId;
    } catch (error) {
        await provider.release(prepared.credentials).catch(() => undefined);
        throw error;
    }
    const serviceName = await uniqueServiceName(stackId, runnerName);
    addLogContext({ stackId, serviceName });

    const cronjobIds: string[] = [];
    const rollback = async () => {
        await deleteCronjobs(client, cronjobIds);
        await removeService(
            client,
            extensionInstanceId,
            stackId,
            serviceName,
        ).catch(() => undefined);
        await deleteStackIfEmpty(client, extensionInstanceId, stackId).catch(
            () => undefined,
        );
        await provider.release(prepared.credentials).catch(() => undefined);
    };

    let service: ServiceResponse | undefined;
    try {
        service = await declareService(
            client,
            extensionInstanceId,
            stackId,
            serviceName,
            {
                description: `${provider.id} runner ${input.name}`,
                image: prepared.image,
                environment: withConcurrency(
                    provider,
                    environment,
                    concurrency,
                ),
                restartPolicy: "always",
                deploy: { resources: { limits: resourceLimits(resources) } },
                volumes: prefixMounts(serviceName, mounts),
            },
        );
        if (cache && service) {
            cronjobIds.push(
                await createTrimCronjob(
                    client,
                    { projectId, stackId, name: input.name },
                    service.id,
                    cacheSizeGb,
                ),
            );
        }
    } catch (error) {
        await rollback();
        throw error;
    }

    const row: NewRunnerRow = {
        id: uuid.v4(),
        extensionInstanceId,
        projectId,
        stackId,
        serviceName,
        serviceId: service?.id ?? null,
        provider: provider.id,
        name: input.name,
        target: prepared.target,
        targetUrl: prepared.targetUrl,
        credentials: JSON.stringify(prepared.credentials),
        labels: prepared.labels,
        ephemeral: prepared.ephemeral,
        tokenType: input.tokenType ?? "registration",
        size: resources.size,
        cpus: resources.size === "custom" ? resources.cpus : null,
        memoryMb: resources.size === "custom" ? resources.memoryMb : null,
        image: prepared.image,
        runnerVersion: prepared.runnerVersion,
        cache,
        cacheSizeGb,
        concurrency,
        cronjobIds: JSON.stringify(cronjobIds),
        createdBy: userId,
    };
    let inserted: RunnerRow;
    try {
        [inserted] = await getDatabase()
            .insert(runners)
            .values(row)
            .returning();
    } catch (error) {
        log.error(
            "runner row could not be stored, removing the service again",
            {
                error,
            },
        );
        await rollback();
        throw error;
    }
    log.info("runner created", {
        runnerId: inserted.id,
        target: prepared.target,
        serviceId: row.serviceId,
    });
    return toView(inserted, service);
}

export async function getRunnerLogs(
    client: MittwaldAPIV2Client,
    extensionInstanceId: string,
    runnerId: string,
    tail = 200,
): Promise<string> {
    const row = await findRunner(extensionInstanceId, runnerId);
    const serviceId = row.serviceId ?? (await fetchService(client, row))?.id;
    if (!serviceId) {
        throw new NotFoundError("runnerContainer");
    }
    const response = await client.container.getServiceLogs({
        stackId: row.stackId,
        serviceId,
        queryParameters: { tail },
    });
    if (response.status === 403) {
        throw new PermissionsInsufficientError(extensionInstanceId);
    }
    if (response.status === 404) {
        throw new NotFoundError("runnerContainer");
    }
    if (response.status !== 200 && response.status !== 206) {
        throw new UpstreamError("error.upstream.logs", {
            status: response.status,
        });
    }
    log.debug("logs fetched", { runnerId, stackId: row.stackId, tail });
    return typeof response.data === "string"
        ? response.data
        : JSON.stringify(response.data);
}

export async function restartRunner(
    client: MittwaldAPIV2Client,
    extensionInstanceId: string,
    runnerId: string,
): Promise<void> {
    const row = await findRunner(extensionInstanceId, runnerId);
    const serviceId = row.serviceId ?? (await fetchService(client, row))?.id;
    if (!serviceId) {
        throw new NotFoundError("runnerContainer");
    }
    const response = await client.container.restartService({
        stackId: row.stackId,
        serviceId,
    });
    if (response.status === 403) {
        throw new PermissionsInsufficientError(extensionInstanceId);
    }
    if (response.status === 404) {
        throw new NotFoundError("runnerContainer");
    }
    assertStatus(response, 204);
    log.info("runner restarted", { runnerId, stackId: row.stackId, serviceId });
}

/**
 * Redeclares the stack with the image of this extension release and the
 * service state mittwald reports, so environment and volumes stay untouched.
 * mittwald recreates the container; GitHub runners keep their registration in
 * the data volume, GitLab runners keep their runner token.
 */
export async function updateRunner(
    client: MittwaldAPIV2Client,
    extensionInstanceId: string,
    runnerId: string,
): Promise<Runner> {
    const row = await findRunner(extensionInstanceId, runnerId);
    const provider = getProviderById(row.provider);
    const service = await fetchService(client, row);
    if (!provider || !service) {
        throw new NotFoundError("runnerContainer");
    }
    const state = service.pendingState ?? service.deployedState;
    const image = provider.currentImage();
    const updatedService = await declareService(
        client,
        extensionInstanceId,
        row.stackId,
        row.serviceName,
        {
            description: service.description,
            image,
            environment: state.envs,
            restartPolicy: service.restartPolicy,
            deploy: service.deploy,
            volumes: state.volumes,
            ports: state.ports,
            command: state.command,
            entrypoint: state.entrypoint,
        },
    );
    const [updated] = await getDatabase()
        .update(runners)
        .set({ image, runnerVersion: provider.runnerVersion })
        .where(eq(runners.id, row.id))
        .returning();
    log.info("runner updated", {
        runnerId,
        stackId: row.stackId,
        from: row.image,
        to: image,
    });
    return toView(updated, updatedService ?? service);
}

/**
 * Changes cache and concurrency after creation. Switching the cache adds or
 * removes the cache volume and environment on the service state mittwald
 * reports, concurrency changes its environment variable; both redeclare the
 * stack and mittwald recreates the container. Turning the cache off deletes
 * its cronjob and volume.
 */
export async function configureRunner(
    client: MittwaldAPIV2Client,
    extensionInstanceId: string,
    input: ConfigureRunnerRequest,
): Promise<Runner> {
    const row = await findRunner(extensionInstanceId, input.runnerId);
    const provider = getProviderById(row.provider);
    const service = await fetchService(client, row);
    if (!provider || !service) {
        throw new NotFoundError("runnerContainer");
    }
    const cache = input.cache;
    const cacheSizeGb = input.cacheSizeGb ?? row.cacheSizeGb;
    const concurrency = provider.concurrencyVariable
        ? (input.concurrency ?? row.concurrency)
        : 1;
    const resources = resolveResources(input.size ? input : row);
    const resourcesChanged =
        resources.size !== row.size ||
        resources.cpus !== resolveResources(row).cpus ||
        resources.memoryMb !== resolveResources(row).memoryMb;
    addLogContext({ runnerId: row.id, stackId: row.stackId });

    let updatedService = service;
    if (
        cache !== row.cache ||
        concurrency !== row.concurrency ||
        resourcesChanged
    ) {
        const state = service.pendingState ?? service.deployedState;
        const plainMounts = unprefixMounts(
            row.serviceName,
            state.volumes ?? [],
        );
        const { environment, mounts } = cache
            ? withCache(state.envs ?? {}, plainMounts)
            : withoutCache(state.envs ?? {}, plainMounts);
        updatedService =
            (await declareService(
                client,
                extensionInstanceId,
                row.stackId,
                row.serviceName,
                {
                    description: service.description,
                    image: state.image,
                    environment: withConcurrency(
                        provider,
                        environment,
                        concurrency,
                    ),
                    restartPolicy: service.restartPolicy,
                    deploy: {
                        ...service.deploy,
                        resources: { limits: resourceLimits(resources) },
                    },
                    volumes: prefixMounts(row.serviceName, mounts),
                    ports: state.ports,
                    command: state.command,
                    entrypoint: state.entrypoint,
                },
            )) ?? service;
    }

    let cronjobIds = parseCronjobIds(row);
    if (cache) {
        if (cronjobIds.length === 0) {
            cronjobIds = [
                await createTrimCronjob(
                    client,
                    row,
                    updatedService.id,
                    cacheSizeGb,
                ),
            ];
        } else if (cacheSizeGb !== row.cacheSizeGb) {
            for (const cronjobId of cronjobIds) {
                await updateTrimCronjob(
                    client,
                    row,
                    updatedService.id,
                    cronjobId,
                    cacheSizeGb,
                );
            }
        }
    } else if (row.cache) {
        await deleteCronjobs(client, cronjobIds);
        cronjobIds = [];
        await deleteVolumes(
            client,
            row.stackId,
            (name) => name === `${row.serviceName}-${CACHE_VOLUME}`,
        );
    }

    const [updated] = await getDatabase()
        .update(runners)
        .set({
            cache,
            cacheSizeGb,
            concurrency,
            size: resources.size,
            cpus: resources.size === "custom" ? resources.cpus : null,
            memoryMb: resources.size === "custom" ? resources.memoryMb : null,
            serviceId: updatedService.id,
            cronjobIds: JSON.stringify(cronjobIds),
        })
        .where(eq(runners.id, row.id))
        .returning();
    log.info("runner configured", {
        cache,
        cacheSizeGb,
        concurrency,
        size: resources.size,
        cpus: resources.cpus,
        memoryMb: resources.memoryMb,
        previousSize: row.size,
        previousCache: row.cache,
        previousCacheSizeGb: row.cacheSizeGb,
        previousConcurrency: row.concurrency,
    });
    return toView(updated, updatedService);
}

export async function deleteRunner(
    client: MittwaldAPIV2Client,
    extensionInstanceId: string,
    runnerId: string,
): Promise<void> {
    const row = await findRunner(extensionInstanceId, runnerId);
    await deleteCronjobs(client, parseCronjobIds(row));
    const stack = await getStack(client, row.stackId);
    if (stack) {
        await removeService(
            client,
            extensionInstanceId,
            row.stackId,
            row.serviceName,
        );
    }
    await releaseProviderRegistration(row);
    await getDatabase().delete(runners).where(eq(runners.id, row.id));
    const stackDeleted = await deleteStackIfEmpty(
        client,
        extensionInstanceId,
        row.stackId,
    );
    log.info("runner deleted", {
        runnerId,
        provider: row.provider,
        stackId: row.stackId,
        serviceName: row.serviceName,
        stackDeleted,
    });
}

async function releaseProviderRegistration(row: RunnerRow): Promise<void> {
    const provider = getProviderById(row.provider);
    if (!provider) {
        return;
    }
    try {
        await provider.release(parseCredentials(row));
    } catch (error) {
        log.warn("provider registration cleanup failed", {
            runnerId: row.id,
            provider: row.provider,
            error,
        });
    }
}

export async function deleteAllRunnersOfInstance(
    client: MittwaldAPIV2Client,
    rows: RunnerRow[],
): Promise<void> {
    for (const row of rows) {
        await deleteCronjobs(client, parseCronjobIds(row));
        await releaseProviderRegistration(row);
    }
    for (const stackId of new Set(rows.map((row) => row.stackId))) {
        try {
            await client.container.deleteStack({ stackId });
        } catch (error) {
            log.error("stack deletion failed during instance cleanup", {
                stackId,
                error,
            });
        }
    }
}
