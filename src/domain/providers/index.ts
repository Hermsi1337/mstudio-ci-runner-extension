import type { CreateRunnerRequest, Provider } from "@/generated/extension-api";
import { forgejoProvider } from "./forgejo.ts";
import { githubProvider } from "./github.ts";
import { gitlabProvider } from "./gitlab.ts";
import type { RunnerProvider } from "./types.ts";

export type { PreparedRunner, RunnerProvider } from "./types.ts";

const providers: { [P in Provider]: RunnerProvider<never> } = {
    github: githubProvider,
    gitlab: gitlabProvider,
    forgejo: forgejoProvider,
};

export function getProvider(input: CreateRunnerRequest): RunnerProvider {
    return providers[input.provider] as RunnerProvider;
}

export function getProviderById(id: string): RunnerProvider | undefined {
    return (providers as Record<string, RunnerProvider<never>>)[id] as
        | RunnerProvider
        | undefined;
}
