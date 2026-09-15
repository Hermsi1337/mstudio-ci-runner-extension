#!/usr/bin/env bash
# Fails when server-only code reached the browser bundle. Every marker is a
# string literal or property name that survives minification and exists only
# in a server module: the logger (AsyncLocalStorage), env.ts (envalid,
# variable names), the Drizzle schema and the mittwald client. A leak throws
# at module load in the browser and mStudio shows "Extension could not be
# loaded", which happened in v0.2.0 through an exported helper of the global
# server function middleware.
set -euo pipefail

assets=.output/public/assets
if [[ ! -d "${assets}" ]]; then
    echo "check-client-bundle: ${assets} not found, run pnpm run build first" >&2
    exit 1
fi

markers=(
    AsyncLocalStorage
    makeValidator
    POSTGRES_HOST
    ENCRYPTION_MASTER_PASSWORD
    runner_stacks
    MITTWALD_API_URL
)

status=0
for marker in "${markers[@]}"; do
    if hits=$(grep -l -- "${marker}" "${assets}"/*.js); then
        echo "check-client-bundle: server-only code in the client bundle: '${marker}' in" >&2
        echo "${hits}" | sed 's/^/  /' >&2
        status=1
    fi
done

if [[ ${status} -eq 0 ]]; then
    echo "check-client-bundle: no server-only code in $(ls "${assets}"/*.js | wc -l) client assets"
fi
exit "${status}"
