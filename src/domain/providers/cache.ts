/**
 * A persistent volume for package manager caches. Runners inherit these
 * variables into every job, so caches survive jobs, restarts and updates
 * without provider-specific cache features. Tools that follow XDG pick up
 * XDG_CACHE_HOME; the others get their own variable.
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
