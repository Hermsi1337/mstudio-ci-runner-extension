import type { RunnerSize } from "@/generated/extension-api";
import { runnerSizes } from "@/runner-sizes.ts";

export interface RunnerResources {
    size: RunnerSize;
    cpus: number | null;
    memoryMb: number | null;
}

/**
 * Presets carry their limits in code, custom sizes carry them in the request or
 * the row. A custom size without a value has no limit for that resource.
 */
export function resolveResources(input: {
    size?: RunnerSize | string | null;
    cpus?: number | null;
    memoryMb?: number | null;
}): RunnerResources {
    if (input.size === "custom") {
        return {
            size: "custom",
            cpus: input.cpus ?? null,
            memoryMb: input.memoryMb ?? null,
        };
    }
    const size =
        input.size && input.size in runnerSizes
            ? (input.size as keyof typeof runnerSizes)
            : "medium";
    return { size, ...runnerSizes[size] };
}

/**
 * An absent key clears that limit: mittwald replaces `deploy` as a whole on
 * PATCH and sets no default limit, only the project quota applies.
 */
export function resourceLimits(
    resources: RunnerResources,
): { cpus?: string; memory?: string } | undefined {
    if (resources.cpus === null && resources.memoryMb === null) {
        return undefined;
    }
    const limits: { cpus?: string; memory?: string } = {};
    if (resources.cpus !== null) {
        limits.cpus = String(resources.cpus);
    }
    if (resources.memoryMb !== null) {
        limits.memory = `${resources.memoryMb}mb`;
    }
    return limits;
}

export function storedLimits(resources: RunnerResources): {
    cpus: number | null;
    memoryMb: number | null;
} {
    if (resources.size !== "custom") {
        return { cpus: null, memoryMb: null };
    }
    return { cpus: resources.cpus, memoryMb: resources.memoryMb };
}
