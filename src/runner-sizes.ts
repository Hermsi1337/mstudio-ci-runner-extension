import type { RunnerSize } from "@/generated/extension-api";

/**
 * Limits of the size presets. Shared by the domain (stack declaration) and the
 * UI (summary before creation), so it must not import either side.
 */
export const runnerSizes: Record<
    Exclude<RunnerSize, "custom">,
    { cpus: number; memoryMb: number }
> = {
    small: { cpus: 0.5, memoryMb: 1024 },
    medium: { cpus: 1, memoryMb: 2048 },
    large: { cpus: 2, memoryMb: 4096 },
};

export const CPU_RANGE = { min: 0.25, max: 8, step: 0.25 };
export const MEMORY_GB_RANGE = { min: 0.5, max: 16, step: 0.5 };

export function toMemoryMb(memoryGb: number): number {
    return Math.round(memoryGb * 1024);
}

export function toMemoryGb(memoryMb: number): number {
    return memoryMb / 1024;
}
