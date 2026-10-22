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
 * A missing key leaves that resource unlimited: mittwald sets no default limit,
 * only the project quota applies.
 */
export function resourceLimits(
    resources: RunnerResources,
): { cpus?: string; memory?: string } | undefined {
    if (resources.cpus === null && resources.memoryMb === null) {
        return undefined;
    }
    return {
        ...(resources.cpus !== null && { cpus: String(resources.cpus) }),
        ...(resources.memoryMb !== null && {
            memory: `${resources.memoryMb}mb`,
        }),
    };
}
