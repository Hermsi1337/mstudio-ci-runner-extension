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
import { getProvider, getProviderById } from "./providers/index.ts";

const log = createLogger("runner");

type ServiceResponse =
    MittwaldAPIV2.Components.Schemas.ContainerServiceResponse;

export const runnerSizes: Record<RunnerSize, { cpus: string; memory: string }> =
    {
        small: { cpus: "0.5", memory: "1gb" },
        medium: { cpus: "1", memory: "2gb" },
        large: { cpus: "2", memory: "4gb" },
    };

const SERVICE_KEY = "runner";

function toView(row: RunnerRow, service?: ServiceResponse | null): Runner {
    const provider = getProviderById(row.provider);
    const image = row.image ?? service?.deployedState.image ?? null;
    const currentImage = provider?.currentImage() ?? null;
    return {
        id: row.id,
        provider: row.provider as Provider,
        name: row.name,
        target: row.target,
        targetUrl: row.targetUrl,
        labels: row.labels.split(",").filter(Boolean),
        ephemeral: row.ephemeral,
        size: (row.size as RunnerSize) ?? "medium",
        stackId: row.stackId,
        serviceId: row.serviceId,
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

function parseCredentials(row: RunnerRow): Record<string, string> {
    try {
        return JSON.parse(row.credentials) as Record<string, string>;
    } catch {
        return {};
    }
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
    log.debug("provider prepared runner", {
        target: prepared.target,
        image: prepared.image,
        environmentKeys: Object.keys(prepared.environment),
        volumes: prepared.volumes,
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

    const volumes = Object.fromEntries(
        prepared.volumes.map((mount) => {
            const name = mount.split(":")[0];
            return [name, { name }];
        }),
    );

    const declared = await client.container.declareStack({
        stackId,
        data: {
            services: {
                [SERVICE_KEY]: {
                    description: `${provider.id} runner ${input.name}`,
                    image: prepared.image,
                    environment: prepared.environment,
                    restartPolicy: "always",
                    deploy: { resources: { limits: runnerSizes[size] } },
                    volumes: prepared.volumes,
                },
            },
            volumes,
        },
    });
    if (declared.status !== 200) {
        await client.container.deleteStack({ stackId }).catch(() => undefined);
        await provider.release(prepared.credentials).catch(() => undefined);
        if (declared.status === 403) {
            throw new PermissionsInsufficientError(extensionInstanceId);
        }
        throw new UpstreamError("error.upstream.stackDeclare", {
            status: declared.status,
        });
    }
    const service =
        declared.data.services?.find((s) => s.serviceName === SERVICE_KEY) ??
        declared.data.services?.[0];

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
        createdBy: userId,
    };
    const [inserted] = await getDatabase()
        .insert(runners)
        .values(row)
        .returning();
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
 * the config volume, GitLab runners keep their runner token.
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
    const mounts = state.volumes ?? [];
    const volumes = Object.fromEntries(
        mounts
            .map((mount) => mount.split(":")[0])
            .filter((name) => !name.startsWith("/"))
            .map((name) => [name, { name }]),
    );

    const declared = await client.container.declareStack({
        stackId: row.stackId,
        data: {
            services: {
                [service.serviceName]: {
                    description: service.description,
                    image,
                    environment: state.envs,
                    restartPolicy: service.restartPolicy,
                    deploy: service.deploy,
                    volumes: mounts,
                    ports: state.ports,
                    command: state.command,
                    entrypoint: state.entrypoint,
                },
            },
            volumes,
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
    const updatedService =
        declared.data.services?.find(
            (s) => s.serviceName === service.serviceName,
        ) ?? service;
    return toView(updated, updatedService);
}

export async function deleteRunner(
    client: MittwaldAPIV2Client,
    extensionInstanceId: string,
    runnerId: string,
): Promise<void> {
    const row = await findRunner(extensionInstanceId, runnerId);
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
