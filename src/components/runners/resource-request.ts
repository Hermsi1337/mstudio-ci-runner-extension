import type {
    ConfigureRunnerRequest,
    Runner,
    RunnerSize,
} from "@/generated/extension-api";
import { runnerSizes, toMemoryGb, toMemoryMb } from "@/runner-sizes.ts";

export interface ResourceFormValues {
    size: RunnerSize;
    cpus: number;
    noCpuLimit: boolean;
    memoryGb: number;
    noMemoryLimit: boolean;
}

export function toResourceRequest(
    values: ResourceFormValues,
): Pick<ConfigureRunnerRequest, "size" | "cpus" | "memoryMb"> {
    if (values.size !== "custom") {
        return { size: values.size };
    }
    return {
        size: "custom",
        cpus: values.noCpuLimit ? null : values.cpus,
        memoryMb: values.noMemoryLimit ? null : toMemoryMb(values.memoryGb),
    };
}

/**
 * A runner without a limit still needs a number behind the hidden field, so
 * unchecking "No limit" shows the medium preset.
 */
export function toResourceFormValues(
    runner: Pick<Runner, "size" | "cpus" | "memoryMb">,
): ResourceFormValues {
    return {
        size: runner.size,
        cpus: runner.cpus ?? runnerSizes.medium.cpus,
        noCpuLimit: runner.cpus === null,
        memoryGb: toMemoryGb(runner.memoryMb ?? runnerSizes.medium.memoryMb),
        noMemoryLimit: runner.memoryMb === null,
    };
}
