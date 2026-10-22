import type { Translate } from "@/i18n/index.ts";

/**
 * A custom runner may lack either limit; the phrase names the missing one
 * instead of a number.
 */
export function formatLimits(
    t: Translate,
    key: "form.size.limits" | "form.summary.service.text",
    { cpus, memoryGb }: { cpus: number | null; memoryGb: number | null },
): string {
    if (cpus === null) {
        return memoryGb === null
            ? t(`${key}.noLimit`)
            : t(`${key}.noCpuLimit`, { memory: memoryGb });
    }
    if (memoryGb === null) {
        return t(`${key}.noMemoryLimit`, { cpus });
    }
    return t(key, { cpus, memory: memoryGb });
}
