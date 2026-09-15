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

# macOS ships no setsid binary; perl's POSIX::setsid gives the dev server its
# own process group there, so stop() can kill the whole tree either way.
if command -v setsid >/dev/null 2>&1; then
    setsid pnpm run dev &
else
    perl -MPOSIX -e 'POSIX::setsid(); exec @ARGV' -- pnpm run dev &
fi
dev_pid=$!
wait "$dev_pid" || true
