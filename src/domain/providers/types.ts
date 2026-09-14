import type { CreateRunnerRequest, Provider } from "@/generated/extension-api";

export interface RunnerCronjob {
    description: string;
    interval: string;
    command: string;
    timeoutSeconds: number;
}

export interface PreparedRunner {
    target: string;
    targetUrl: string;
    image: string;
    runnerVersion: string;
    environment: Record<string, string>;
    credentials: Record<string, string>;
    volumes: string[];
    cronjobs: RunnerCronjob[];
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
