import {
    assertStatus,
    type MittwaldAPIV2,
    type MittwaldAPIV2Client,
} from "@mittwald/api-client";
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
import {
    cacheTrimCronjob,
    deleteCacheVolume,
    withCache,
    withoutCache,
} from "./cache.ts";
import { getProvider, getProviderById } from "./providers/index.ts";

const log = createLogger("runner");

type ServiceResponse =
    MittwaldAPIV2.Components.Schemas.ContainerServiceResponse;
type ServiceDeclaration =
    MittwaldAPIV2.Components.Schemas.ContainerServiceDeclareRequest;

export const runnerSizes: Record<RunnerSize, { cpus: string; memory: string }> =
    {
        small: { cpus: "0.5", memory: "1gb" },
        medium: { cpus: "1", memory: "2gb" },
        large: { cpus: "2", memory: "4gb" },
    };

const SERVICE_KEY = "runner";
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
    return {
        id: row.id,
        provider: row.provider as Provider,
        name: row.name,
        target: row.target,
        targetUrl: row.targetUrl,
        labels: row.labels.split(",").filter(Boolean),
        ephemeral: row.ephemeral,
        size: (row.size as RunnerSize) ?? "medium",
        cache: row.cache,
        cacheSizeGb: row.cacheSizeGb,
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

/**
 * Named mounts become stack volumes, bind mounts (leading slash) do not.
 */
function volumeDeclarations(mounts: string[]) {
    return Object.fromEntries(
        mounts
            .map((mount) => mount.split(":")[0])
            .filter((name) => !name.startsWith("/"))
            .map((name) => [name, { name }]),
    );
}

async function declareService(
    client: MittwaldAPIV2Client,
    extensionInstanceId: string,
    stackId: string,
    serviceName: string,
    service: ServiceDeclaration,
): Promise<ServiceResponse | undefined> {
    const declared = await client.container.declareStack({
        stackId,
        data: {
            services: { [serviceName]: service },
            volumes: volumeDeclarations(service.volumes ?? []),
        },
    });
    if (declared.status === 403) {
        throw new PermissionsInsufficientError(extensionInstanceId);
    }
    if (declared.status !== 200) {
        throw new UpstreamError("error.upstream.stackDeclare", {
            status: declared.status,
        });
    }
    return (
        declared.data.services?.find((s) => s.serviceName === serviceName) ??
        declared.data.services?.[0]
    );
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

async function fetchService(
    client: MittwaldAPIV2Client,
    row: RunnerRow,
): Promise<ServiceResponse | null | undefined> {
    const response = await client.container.getStack({ stackId: row.stackId });
    if ((response.status as number) === 404) {
        return null;
    }
    if (response.status !== 200) {
        return undefined;
    }
    return (
        response.data.services?.find((s) => s.serviceName === SERVICE_KEY) ??
        response.data.services?.[0] ??
        null
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

    return Promise.all(
        rows.map(async (row) => toView(row, await fetchService(client, row))),
    );
}

export async function createRunner(
    client: MittwaldAPIV2Client,
    extensionInstanceId: string,
    projectId: string,
    userId: string,
    input: CreateRunnerRequest,
): Promise<Runner> {
    const provider = getProvider(input);
    const size: RunnerSize = input.size ?? "medium";
    const labels = (input.labels ?? "mittwald")
        .split(",")
        .map((l) => l.trim())
        .filter(Boolean)
        .join(",");
    const runnerName = slugify(input.name) || `runner-${uuid.v4().slice(0, 8)}`;

    addLogContext({ provider: provider.id, projectId });
    log.info("creating runner", { name: input.name, runnerName, size });
    const prepared = await provider.prepare({ ...input, labels }, runnerName);
    const cache = input.cache ?? false;
    const cacheSizeGb = input.cacheSizeGb ?? 10;
    const { environment, mounts } = cache
        ? withCache(prepared.environment, prepared.volumes)
        : withoutCache(prepared.environment, prepared.volumes);
    log.debug("provider prepared runner", {
        target: prepared.target,
        image: prepared.image,
        environmentKeys: Object.keys(environment),
        volumes: mounts,
    });

    const created = await client.container.createStack({
        projectId,
        data: { description: `CI Runner (${provider.id}): ${input.name}` },
    });
    if (created.status === 403) {
        await provider.release(prepared.credentials).catch(() => undefined);
        throw new PermissionsInsufficientError(extensionInstanceId);
    }
    if (created.status !== 201) {
        await provider.release(prepared.credentials).catch(() => undefined);
        throw new UpstreamError("error.upstream.stackCreate", {
            status: created.status,
        });
    }
    const stackId = created.data.id;
    addLogContext({ stackId });
    log.debug("stack created");

    const cronjobIds: string[] = [];
    const rollback = async () => {
        await deleteCronjobs(client, cronjobIds);
        await client.container.deleteStack({ stackId }).catch(() => undefined);
        await provider.release(prepared.credentials).catch(() => undefined);
    };

    let service: ServiceResponse | undefined;
    try {
        service = await declareService(
            client,
            extensionInstanceId,
            stackId,
            SERVICE_KEY,
            {
                description: `${provider.id} runner ${input.name}`,
                image: prepared.image,
                environment,
                restartPolicy: "always",
                deploy: { resources: { limits: runnerSizes[size] } },
                volumes: mounts,
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
        serviceId: service?.id ?? null,
        provider: provider.id,
        name: input.name,
        target: prepared.target,
        targetUrl: prepared.targetUrl,
        credentials: JSON.stringify(prepared.credentials),
        labels,
        ephemeral: prepared.ephemeral,
        size,
        image: prepared.image,
        runnerVersion: prepared.runnerVersion,
        cache,
        cacheSizeGb,
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
        log.error("runner row could not be stored, removing the stack again", {
            error,
        });
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
 * the runner-data volume, GitLab runners keep their runner token.
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
        service.serviceName,
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
 * Turns the package manager cache on or off after creation or changes its
 * limit. Switching adds or removes the cache volume and environment on the
 * service state mittwald reports; mittwald recreates the container. Turning
 * the cache off deletes its cronjob and volume.
 */
export async function configureRunner(
    client: MittwaldAPIV2Client,
    extensionInstanceId: string,
    input: ConfigureRunnerRequest,
): Promise<Runner> {
    const row = await findRunner(extensionInstanceId, input.runnerId);
    const service = await fetchService(client, row);
    if (!service) {
        throw new NotFoundError("runnerContainer");
    }
    const cache = input.cache;
    const cacheSizeGb = input.cacheSizeGb ?? row.cacheSizeGb;
    addLogContext({ runnerId: row.id, stackId: row.stackId });

    let updatedService = service;
    if (cache !== row.cache) {
        const state = service.pendingState ?? service.deployedState;
        const { environment, mounts } = cache
            ? withCache(state.envs ?? {}, state.volumes ?? [])
            : withoutCache(state.envs ?? {}, state.volumes ?? []);
        updatedService =
            (await declareService(
                client,
                extensionInstanceId,
                row.stackId,
                service.serviceName,
                {
                    description: service.description,
                    image: state.image,
                    environment,
                    restartPolicy: service.restartPolicy,
                    deploy: service.deploy,
                    volumes: mounts,
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
        await deleteCacheVolume(client, row.stackId);
    }

    const [updated] = await getDatabase()
        .update(runners)
        .set({
            cache,
            cacheSizeGb,
            serviceId: updatedService.id,
            cronjobIds: JSON.stringify(cronjobIds),
        })
        .where(eq(runners.id, row.id))
        .returning();
    log.info("runner configured", {
        cache,
        cacheSizeGb,
        previousCache: row.cache,
        previousCacheSizeGb: row.cacheSizeGb,
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
    const response = await client.container.deleteStack({
        stackId: row.stackId,
    });
    if (response.status === 403) {
        throw new PermissionsInsufficientError(extensionInstanceId);
    }
    if (response.status !== 204 && response.status !== 404) {
        throw new UpstreamError("error.upstream.stackDelete", {
            status: response.status,
        });
    }
    await releaseProviderRegistration(row);
    await getDatabase().delete(runners).where(eq(runners.id, row.id));
    log.info("runner deleted", {
        runnerId,
        provider: row.provider,
        stackId: row.stackId,
        stackStatus: response.status,
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
        try {
            await client.container.deleteStack({ stackId: row.stackId });
        } catch (error) {
            log.error("stack deletion failed during instance cleanup", {
                runnerId: row.id,
                stackId: row.stackId,
                error,
            });
        }
        await releaseProviderRegistration(row);
    }
}
