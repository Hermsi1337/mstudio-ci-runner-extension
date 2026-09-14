/**
 * Reads target and registration token out of the command GitHub shows on the
 * "New self-hosted runner" page, e.g.
 * `./config.sh --url https://github.com/acme/app --token AEBIHM56SBF3SULYYYY3BH3KU333M`.
 * Other flags are ignored. A bare token without --url is not accepted.
 */
export interface ConfigCommand {
    target: string;
    token: string;
}

const urlPattern =
    /--url[\s=]+["']?(https?:\/\/github\.com\/[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)?)/;
const tokenPattern = /--token[\s=]+["']?([A-Z0-9]{20,})/;

export function parseConfigCommand(input: string): ConfigCommand | null {
    const url = urlPattern.exec(input)?.[1];
    const token = tokenPattern.exec(input)?.[1];
    if (!url || !token) {
        return null;
    }
    return { target: url.replace(/\/+$/, ""), token };
}
