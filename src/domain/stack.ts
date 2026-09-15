import type { MittwaldAPIV2, MittwaldAPIV2Client } from "@mittwald/api-client";
import { and, eq } from "drizzle-orm";
import { getDatabase } from "@/db";
import { type RunnerStackRow, runnerStacks, runners } from "@/db/schema.ts";
import {
    PermissionsInsufficientError,
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
export async function findOrCreateStack(
    client: MittwaldAPIV2Client,
    extensionInstanceId: string,
    projectId: string,
    targetUrl: string,
    description: string,
): Promise<RunnerStackRow> {
    const existing = await findStack(extensionInstanceId, targetUrl);
    if (existing && (await stackExists(client, existing.stackId))) {
        return existing;
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
    const [inserted] = await getDatabase()
        .insert(runnerStacks)
        .values({
            stackId: created.data.id,
            extensionInstanceId,
            projectId,
            targetUrl,
        })
        .onConflictDoNothing()
        .returning();
    if (inserted) {
        log.info("stack created", { stackId: inserted.stackId, targetUrl });
        return inserted;
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
    return winner;
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

async function stackExists(
    client: MittwaldAPIV2Client,
    stackId: string,
): Promise<boolean> {
    const response = await client.container.getStack({ stackId });
    return response.status === 200;
}

export async function getStack(
    client: MittwaldAPIV2Client,
    stackId: string,
): Promise<StackResponse | null | undefined> {
    const response = await client.container.getStack({ stackId });
    if ((response.status as number) === 404) {
        return null;
    }
    return response.status === 200 ? response.data : undefined;
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
        throw new UpstreamError("error.upstream.stackDeclare", {
            status: declared.status,
        });
    }
    const services = declared.data.services ?? [];
    return (
        services.find((s) => s.serviceName === serviceName) ??
        (services.length === 1 ? services[0] : undefined)
    );
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
 * Deletes the stack when no runner row points at it any more. Called after
 * the runner row is gone.
 */
export async function deleteStackIfEmpty(
    client: MittwaldAPIV2Client,
    extensionInstanceId: string,
    stackId: string,
): Promise<boolean> {
    const [remaining] = await getDatabase()
        .select({ id: runners.id })
        .from(runners)
        .where(eq(runners.stackId, stackId))
        .limit(1);
    if (remaining) {
        return false;
    }
    const response = await client.container.deleteStack({ stackId });
    if (response.status === 403) {
        throw new PermissionsInsufficientError(extensionInstanceId);
    }
    if (response.status !== 204 && (response.status as number) !== 404) {
        throw new UpstreamError("error.upstream.stackDelete", {
            status: response.status,
        });
    }
    await getDatabase()
        .delete(runnerStacks)
        .where(eq(runnerStacks.stackId, stackId));
    log.info("stack deleted", { stackId, status: response.status });
    return true;
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
