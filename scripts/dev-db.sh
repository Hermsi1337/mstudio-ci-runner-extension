#!/usr/bin/env bash
# Local PostgreSQL for development, configured from .env.
set -euo pipefail
cd "$(dirname "$0")/.."
NAME=mstudio-ci-runner-db
if [[ -f .env ]]; then set -a; source .env; set +a; fi
case "${1:-up}" in
    up)
        if docker ps -a --format '{{.Names}}' | grep -qx "$NAME"; then
            docker start "$NAME" >/dev/null
        else
            docker run -d --name "$NAME" \
                -p "${POSTGRES_PORT:-5433}:5432" \
                -e POSTGRES_USER="${POSTGRES_USER:-postgres}" \
                -e POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-postgres}" \
                -e POSTGRES_DB="${POSTGRES_DB:-extension}" \
                -v "${NAME}-data:/var/lib/postgresql/data" \
                postgres:16-alpine >/dev/null
        fi
        echo "PostgreSQL listening on localhost:${POSTGRES_PORT:-5433} (container ${NAME})"
        ;;
    down)  docker stop "$NAME" >/dev/null && echo "stopped" ;;
    rm)    docker rm -f "$NAME" >/dev/null; docker volume rm -f "${NAME}-data" >/dev/null; echo "removed" ;;
    *)     echo "usage: $0 [up|down|rm]" >&2; exit 1 ;;
esac
