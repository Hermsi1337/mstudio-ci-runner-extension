/**
 * A persistent volume for package manager caches, independent of the provider.
 * Runners inherit these variables into every job, so caches survive jobs,
 * restarts and updates without provider-specific cache features. Tools that
 * follow XDG pick up XDG_CACHE_HOME; the others get their own variable.
 * mittwald volumes have no size limit, so an hourly cronjob inside the
 * container trims the directory with docker/runner/common/trim-cache.sh.
 * The volume is separate from runner-data so its usage shows up on its own in
 * mStudio and turning the cache off frees the space.
 */
const CACHE_DIR = "/home/runner/.cache";

export const CACHE_VOLUME = "tool-cache";

export const cacheMount = `${CACHE_VOLUME}:${CACHE_DIR}`;

export const cacheEnvironment: Record<string, string> = {
    XDG_CACHE_HOME: CACHE_DIR,
    npm_config_cache: `${CACHE_DIR}/npm`,
    npm_config_store_dir: `${CACHE_DIR}/pnpm-store`,
    YARN_CACHE_FOLDER: `${CACHE_DIR}/yarn`,
    PIP_CACHE_DIR: `${CACHE_DIR}/pip`,
    COMPOSER_CACHE_DIR: `${CACHE_DIR}/composer`,
    GOCACHE: `${CACHE_DIR}/go-build`,
    GOMODCACHE: `${CACHE_DIR}/go-mod`,
};

export interface CacheCronjob {
    description: string;
    interval: string;
    command: string;
    timeoutSeconds: number;
}

export function cacheTrimCronjob(sizeGb: number): CacheCronjob {
    return {
        description: `Trim runner cache to ${sizeGb} GB`,
        interval: "0 * * * *",
        command: `/usr/local/bin/trim-cache.sh ${CACHE_DIR} ${sizeGb}`,
        timeoutSeconds: 600,
    };
}

export function withoutCache(
    environment: Record<string, string>,
    mounts: string[],
): { environment: Record<string, string>; mounts: string[] } {
    return {
        environment: Object.fromEntries(
            Object.entries(environment).filter(
                ([key]) => !(key in cacheEnvironment),
            ),
        ),
        mounts: mounts.filter((mount) => mount !== cacheMount),
    };
}

export function withCache(
    environment: Record<string, string>,
    mounts: string[],
): { environment: Record<string, string>; mounts: string[] } {
    const base = withoutCache(environment, mounts);
    return {
        environment: { ...base.environment, ...cacheEnvironment },
        mounts: [...base.mounts, cacheMount],
    };
}
