import type { Provider } from "@/generated/extension-api";

/**
 * Reads target and token out of the command a CI system shows when a runner
 * is created there. GitHub ("New self-hosted runner"):
 * `./config.sh --url https://github.com/acme/app --token AEBIHM56SBF3SULYYYY3BH3KU333M`.
 * GitLab ("New runner"):
 * `gitlab-runner register --url https://gitlab.com --token glrt-...`.
 * Other flags are ignored. A bare token without --url is not accepted.
 */
export interface ConfigCommand {
    target: string;
    token: string;
}

const patterns: Record<Provider, { url: RegExp; token: RegExp }> = {
    github: {
        url: /--url[\s=]+["']?(https?:\/\/github\.com\/[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)?)/,
        token: /--token[\s=]+["']?([A-Z0-9]{20,})/,
    },
    gitlab: {
        url: /--url[\s=]+["']?(https?:\/\/[A-Za-z0-9_.:-]+(?:\/[A-Za-z0-9_.-]+)*)/,
        token: /--token[\s=]+["']?(glrt-[A-Za-z0-9_-]{16,})/,
    },
};

export function parseConfigCommand(
    provider: Provider,
    input: string,
): ConfigCommand | null {
    const url = patterns[provider].url.exec(input)?.[1];
    const token = patterns[provider].token.exec(input)?.[1];
    if (!url || !token) {
        return null;
    }
    return { target: url.replace(/\/+$/, ""), token };
}
