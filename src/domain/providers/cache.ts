import type { RunnerCronjob } from "./types.ts";

/**
 * A persistent volume for package manager caches. Runners inherit these
 * variables into every job, so caches survive jobs, restarts and updates
 * without provider-specific cache features. Tools that follow XDG pick up
 * XDG_CACHE_HOME; the others get their own variable. mittwald volumes have no
 * size limit, so an hourly cronjob inside the container trims the directory
 * with docker/runner/common/trim-cache.sh.
 */
const CACHE_DIR = "/home/runner/.cache";

export const cacheVolume = `tool-cache:${CACHE_DIR}`;

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

export function cacheTrimCronjob(sizeGb: number): RunnerCronjob {
    return {
        description: `Trim runner cache to ${sizeGb} GB`,
        interval: "0 * * * *",
        command: `/usr/local/bin/trim-cache.sh ${CACHE_DIR} ${sizeGb}`,
        timeoutSeconds: 600,
    };
}
