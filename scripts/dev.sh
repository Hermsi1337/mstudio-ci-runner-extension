#!/usr/bin/env bash
# Starts PostgreSQL and the dev server together; stops both when the script ends.
set -euo pipefail
cd "$(dirname "$0")/.."

scripts/dev-db.sh up

stop() {
    trap - EXIT INT TERM
    if [[ -n "${dev_pid:-}" ]]; then
        kill -TERM -- -"$dev_pid" 2>/dev/null || true
        wait "$dev_pid" 2>/dev/null || true
    fi
    scripts/dev-db.sh down
}
trap stop EXIT INT TERM

until docker exec mstudio-ci-runner-db pg_isready -q 2>/dev/null; do sleep 1; done

setsid pnpm run dev &
dev_pid=$!
wait "$dev_pid" || true
