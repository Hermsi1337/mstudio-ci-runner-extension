import type { MittwaldAPIV2, MittwaldAPIV2Client } from "@mittwald/api-client";
import { and, eq } from "drizzle-orm";
import { getDatabase } from "@/db";
import { type RunnerStackRow, runnerStacks, runners } from "@/db/schema.ts";
import {
    NotFoundError,
    PermissionsInsufficientError,
    stackDeclareError,
    UpstreamError,
} from "@/global-errors.ts";
import { createLogger } from "@/logger.ts";

const log = createLogger("stack");

export type StackResponse =
    MittwaldAPIV2.Components.Schemas.ContainerStackResponse;
export type ServiceResponse =
    MittwaldAPIV2.Components.Schemas.ContainerServiceResponse;
export type ServiceDeclaration =
    MittwaldAPIV2.Components.Schemas.ContainerServiceRequest;

/**
 * Every runner of a registration target shares one stack. The row in
 * runner_stacks with its unique (extension instance, target) pair is the lock:
 * two parallel creates both create a stack, the loser sees the conflict and
 * deletes its own stack again.
 */
export interface FoundOrCreatedStack {
    stackId: string;
    /** True when this call created the stack, false when it reused one. */
    created: boolean;
}

export async function findOrCreateStack(
    client: MittwaldAPIV2Client,
    extensionInstanceId: string,
    projectId: string,
    targetUrl: string,
    description: string,
): Promise<FoundOrCreatedStack> {
    const existing = await findStack(extensionInstanceId, targetUrl);
    if (existing && (await stackExists(client, existing.stackId))) {
        return { stackId: existing.stackId, created: false };
    }
    if (existing) {
        log.warn("stack vanished outside the extension, creating a new one", {
            stackId: existing.stackId,
            targetUrl,
        });
        await getDatabase()
            .delete(runnerStacks)
            .where(eq(runnerStacks.stackId, existing.stackId));
    }

    const created = await client.container.createStack({
        projectId,
        data: { description },
    });
    if (created.status === 403) {
        throw new PermissionsInsufficientError(extensionInstanceId);
    }
    if (created.status !== 201) {
        throw new UpstreamError("error.upstream.stackCreate", {
            status: created.status,
        });
    }
    let inserted: RunnerStackRow | undefined;
    try {
        [inserted] = await getDatabase()
            .insert(runnerStacks)
            .values({
                stackId: created.data.id,
                extensionInstanceId,
                projectId,
                targetUrl,
            })
            .onConflictDoNothing()
            .returning();
    } catch (insertError) {
        log.warn("persisting the stack failed, deleting it again", {
            stackId: created.data.id,
            targetUrl,
        });
        await client.container
            .deleteStack({ stackId: created.data.id })
            .catch(() => undefined);

        throw insertError;
    }
    if (inserted) {
        log.info("stack created", { stackId: inserted.stackId, targetUrl });
        return { stackId: inserted.stackId, created: true };
    }
    log.debug("lost the race for the stack, removing the duplicate", {
        stackId: created.data.id,
    });
    await client.container
        .deleteStack({ stackId: created.data.id })
        .catch(() => undefined);
    const winner = await findStack(extensionInstanceId, targetUrl);
    if (!winner) {
        throw new UpstreamError("error.upstream.stackCreate", { status: 409 });
    }
    return { stackId: winner.stackId, created: false };
}

async function findStack(
    extensionInstanceId: string,
    targetUrl: string,
): Promise<RunnerStackRow | undefined> {
    const [row] = await getDatabase()
        .select()
        .from(runnerStacks)
        .where(
            and(
                eq(runnerStacks.extensionInstanceId, extensionInstanceId),
                eq(runnerStacks.targetUrl, targetUrl),
            ),
        );
    return row;
}

/**
 * Only a 404 means the stack is gone. Any other failure is transient or a
 * permission problem and must not be mistaken for a vanished stack, because
 * callers replace or delete state based on this answer.
 */
async function stackExists(
    client: MittwaldAPIV2Client,
    stackId: string,
): Promise<boolean> {
    const response = await client.container.getStack({ stackId });
    if (response.status === 200) {
        return true;
    }
    if ((response.status as number) === 404) {
        return false;
    }

    throw new UpstreamError("error.upstream.stackGet", {
        status: response.status,
    });
}

export async function getStack(
    client: MittwaldAPIV2Client,
    stackId: string,
): Promise<StackResponse | null> {
    const response = await client.container.getStack({ stackId });
    if ((response.status as number) === 404) {
        return null;
    }
    if (response.status !== 200) {
        throw new UpstreamError("error.upstream.stackGet", {
            status: response.status,
        });
    }

    return response.data;
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

/**
 * PATCH touches only the named service and its volumes, the other runners of
 * the stack stay as they are. A stack that reports a single service reports
 * ours, whatever it is called (the Prism mock answers with example names).
 */
export async function declareService(
    client: MittwaldAPIV2Client,
    extensionInstanceId: string,
    stackId: string,
    serviceName: string,
    service: ServiceDeclaration,
): Promise<ServiceResponse | undefined> {
    const declared = await client.container.updateStack({
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
        log.warn("stack declaration rejected", {
            stackId,
            serviceName,
            status: declared.status,
            response: JSON.stringify(declared.data).slice(0, 2000),
        });

        throw stackDeclareError(declared.status, declared.data);
    }
    const services = declared.data.services ?? [];
    return (
        services.find((s) => s.serviceName === serviceName) ??
        (services.length === 1 ? services[0] : undefined)
    );
}

/**
 * A declaration only records the pending state of a service; the container
 * keeps running its deployed state until mittwald recreates it. This action
 * recreates one service, unlike the `recreate` query parameter of updateStack,
 * which would hit every runner that shares the stack. Same approach as
 * mittwald/deploy-container-action after its stack update.
 */
export async function recreateService(
    client: MittwaldAPIV2Client,
    extensionInstanceId: string,
    stackId: string,
    serviceId: string,
): Promise<void> {
    const response = await client.container.recreateService({
        stackId,
        serviceId,
    });
    if (response.status === 403) {
        throw new PermissionsInsufficientError(extensionInstanceId);
    }
    if (response.status === 404) {
        throw new NotFoundError("runnerContainer");
    }
    if (response.status !== 204) {
        throw new UpstreamError("error.upstream.recreate", {
            status: response.status,
        });
    }
    log.info("service recreated", { stackId, serviceId });
}

/**
 * Removes the service from the stack and deletes the volumes that carry its
 * prefix. A volume that mittwald still reports as in use (412) stays
 * orphaned in the stack and can be removed in mStudio.
 */
export async function removeService(
    client: MittwaldAPIV2Client,
    extensionInstanceId: string,
    stackId: string,
    serviceName: string,
): Promise<void> {
    const removed = await client.container.updateStack({
        stackId,
        data: { services: { [serviceName]: {} } },
    });
    if (removed.status === 403) {
        throw new PermissionsInsufficientError(extensionInstanceId);
    }
    if (removed.status !== 200 && (removed.status as number) !== 404) {
        throw new UpstreamError("error.upstream.stackDeclare", {
            status: removed.status,
        });
    }
    await deleteVolumes(client, stackId, (name) =>
        name.startsWith(`${serviceName}-`),
    );
    log.info("service removed", { stackId, serviceName });
}

export async function deleteVolumes(
    client: MittwaldAPIV2Client,
    stackId: string,
    matches: (name: string) => boolean,
): Promise<void> {
    const listed = await client.container.listStackVolumes({ stackId });
    if (listed.status !== 200) {
        log.warn("volume lookup failed", { stackId, status: listed.status });
        return;
    }
    for (const volume of listed.data.filter((v) => matches(v.name))) {
        const deleted = await client.container.deleteVolume({
            stackId,
            volumeId: volume.id,
        });
        if (deleted.status !== 204) {
            log.warn("volume deletion failed, it stays orphaned in the stack", {
                stackId,
                volume: volume.name,
                status: deleted.status,
            });
            continue;
        }
        log.info("volume deleted", { stackId, volume: volume.name });
    }
}

/**
 * Deletes the mittwald stack. The runner_stacks row is expected to be gone
 * already (deleteRunner removes it inside its transaction).
 */
export async function deleteStackUpstream(
    client: MittwaldAPIV2Client,
    extensionInstanceId: string,
    stackId: string,
): Promise<void> {
    const response = await client.container.deleteStack({ stackId });
    if (response.status === 403) {
        throw new PermissionsInsufficientError(extensionInstanceId);
    }
    if (response.status !== 204 && (response.status as number) !== 404) {
        throw new UpstreamError("error.upstream.stackDelete", {
            status: response.status,
        });
    }
    log.info("stack deleted", { stackId, status: response.status });
}

export async function deleteStackWithRow(
    client: MittwaldAPIV2Client,
    extensionInstanceId: string,
    stackId: string,
): Promise<void> {
    await deleteStackUpstream(client, extensionInstanceId, stackId);
    await getDatabase()
        .delete(runnerStacks)
        .where(eq(runnerStacks.stackId, stackId));
}

/**
 * Service keys are unique per stack and limited to 63 characters. A second
 * runner with the same name in the same target gets a numeric suffix.
 */
export async function uniqueServiceName(
    stackId: string,
    slug: string,
): Promise<string> {
    const taken = new Set(
        (
            await getDatabase()
                .select({ serviceName: runners.serviceName })
                .from(runners)
                .where(eq(runners.stackId, stackId))
        ).map((row) => row.serviceName),
    );
    const base = `runner-${slug}`.slice(0, 60);
    if (!taken.has(base)) {
        return base;
    }
    for (let i = 2; ; i++) {
        const candidate = `${base}-${i}`;
        if (!taken.has(candidate)) {
            return candidate;
        }
    }
}

/**
 * Volumes live in the stack namespace, so every runner prefixes its own with
 * the service name: data:/x becomes runner-web-data:/x.
 */
export function prefixMounts(serviceName: string, mounts: string[]): string[] {
    return mounts.map((mount) =>
        mount.startsWith("/") ? mount : `${serviceName}-${mount}`,
    );
}

export function unprefixMounts(
    serviceName: string,
    mounts: string[],
): string[] {
    const prefix = `${serviceName}-`;
    return mounts.map((mount) =>
        mount.startsWith(prefix) ? mount.slice(prefix.length) : mount,
    );
}
