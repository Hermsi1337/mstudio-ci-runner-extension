const VERSION_PATTERN = /^(\d+)\.(\d+)\.(\d+)$/;

function parseVersion(version: string): number[] | null {
    const match = VERSION_PATTERN.exec(version);
    if (!match) {
        return null;
    }

    return [Number(match[1]), Number(match[2]), Number(match[3])];
}

export function isNewerVersion(candidate: string, current: string): boolean {
    const candidateParts = parseVersion(candidate);
    const currentParts = parseVersion(current);
    if (!candidateParts || !currentParts) {
        return false;
    }
    for (let index = 0; index < candidateParts.length; index++) {
        if (candidateParts[index] !== currentParts[index]) {
            return candidateParts[index] > currentParts[index];
        }
    }

    return false;
}
