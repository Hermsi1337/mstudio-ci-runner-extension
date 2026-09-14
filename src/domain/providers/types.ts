import type { CreateRunnerRequest, Provider } from "@/generated/extension-api";

/**
 * Every runner image keeps its persistent state below /home/runner/data
 * (registration, work directory) so a runner needs exactly one volume. The
 * package manager cache is a second, optional volume handled by
 * src/domain/cache.ts.
 */
/** The domain prefixes the name with the service name: runner-<slug>-data. */
export const DATA_VOLUME_MOUNT = "data:/home/runner/data";

export interface PreparedRunner {
    target: string;
    targetUrl: string;
    image: string;
    runnerVersion: string;
    environment: Record<string, string>;
    credentials: Record<string, string>;
    volumes: string[];
    /** Comma separated labels or tags to show; empty when they live in the CI system only. */
    labels: string;
    ephemeral: boolean;
}

export interface RunnerProvider<
    Request extends CreateRunnerRequest = CreateRunnerRequest,
> {
    readonly id: Provider;
    readonly runnerVersion: string;
    /**
     * Environment variable that sets how many jobs the runner takes at once.
     * Undefined for runners that take one job at a time.
     */
    readonly concurrencyVariable?: string;
    currentImage(): string;
    prepare(input: Request, runnerName: string): Promise<PreparedRunner>;
    release(credentials: Record<string, string>): Promise<void>;
}

export type ProviderRequest<P extends Provider> = Extract<
    CreateRunnerRequest,
    { provider: P }
>;
