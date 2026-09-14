import type { CreateRunnerRequest, Provider } from "@/generated/extension-api";

/**
 * Every runner image keeps its persistent state below /home/runner/data
 * (registration, work directory) so a runner needs exactly one volume. The
 * package manager cache is a second, optional volume handled by
 * src/domain/cache.ts.
 */
export const DATA_VOLUME_MOUNT = "runner-data:/home/runner/data";

export interface PreparedRunner {
    target: string;
    targetUrl: string;
    image: string;
    runnerVersion: string;
    environment: Record<string, string>;
    credentials: Record<string, string>;
    volumes: string[];
    ephemeral: boolean;
}

export interface RunnerProvider<
    Request extends CreateRunnerRequest = CreateRunnerRequest,
> {
    readonly id: Provider;
    readonly runnerVersion: string;
    currentImage(): string;
    prepare(input: Request, runnerName: string): Promise<PreparedRunner>;
    release(credentials: Record<string, string>): Promise<void>;
}

export type ProviderRequest<P extends Provider> = Extract<
    CreateRunnerRequest,
    { provider: P }
>;
