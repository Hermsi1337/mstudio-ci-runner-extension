#!/usr/bin/env bash
# Registers this container as a GitLab Runner (shell executor) and runs it.
#
# Environment:
#   CI_SERVER_URL      GitLab base URL, e.g. https://gitlab.com                          [required]
#   CI_SERVER_TOKEN    runner authentication token (glrt-...) created via UI or API      [required]
#   RUNNER_NAME        runner description/name (default: hostname)
#   RUNNER_DATA_DIR    persistent state, the data volume (default: /home/runner/data)
#   RUNNER_BUILDS_DIR  builds directory (default: RUNNER_DATA_DIR/builds)
#   RUNNER_CACHE_DIR   directory for the cache: keyword of GitLab CI (default: RUNNER_DATA_DIR/cache)
#   RUNNER_CONCURRENT  concurrent jobs (default: 1)
#   RUNNER_UNREGISTER_ON_EXIT  "true" => remove the runner from GitLab on SIGTERM (default: false,
#                      the extension deletes the runner via API itself)
#   DOCKER_HOST        set by Docker in jobs; starts mstudio-port-forward, which makes ports
#                      published by the docker service reachable on localhost
set -euo pipefail

: "${CI_SERVER_URL:?CI_SERVER_URL is required}"
: "${CI_SERVER_TOKEN:?CI_SERVER_TOKEN is required}"
RUNNER_NAME="${RUNNER_NAME:-$(hostname)}"
RUNNER_DATA_DIR="${RUNNER_DATA_DIR:-/home/runner/data}"
# Runners created before the data volume mount builds and cache volumes
# at these paths. The image no longer creates them, so their presence means
# such a volume is mounted.
if [[ -d /home/runner/builds ]]; then
    RUNNER_BUILDS_DIR="${RUNNER_BUILDS_DIR:-/home/runner/builds}"
    RUNNER_CACHE_DIR="${RUNNER_CACHE_DIR:-/home/runner/cache}"
fi
RUNNER_BUILDS_DIR="${RUNNER_BUILDS_DIR:-${RUNNER_DATA_DIR}/builds}"
RUNNER_CACHE_DIR="${RUNNER_CACHE_DIR:-${RUNNER_DATA_DIR}/cache}"
RUNNER_CONCURRENT="${RUNNER_CONCURRENT:-1}"
RUNNER_UNREGISTER_ON_EXIT="${RUNNER_UNREGISTER_ON_EXIT:-false}"
CONFIG="${HOME}/.gitlab-runner/config.toml"

mkdir -p "${RUNNER_BUILDS_DIR}" "${RUNNER_CACHE_DIR}"

if [[ ! "${RUNNER_CONCURRENT}" =~ ^[0-9]+$ ]]; then
    echo "RUNNER_CONCURRENT must be a positive integer, got '${RUNNER_CONCURRENT}'" >&2
    exit 1
fi

echo "[entrypoint] registering ${RUNNER_NAME} at ${CI_SERVER_URL} (executor: shell)"
rm -f "${CONFIG}"
gitlab-runner register \
    --non-interactive \
    --config "${CONFIG}" \
    --url "${CI_SERVER_URL}" \
    --token "${CI_SERVER_TOKEN}" \
    --name "${RUNNER_NAME}" \
    --executor shell \
    --shell bash \
    --builds-dir "${RUNNER_BUILDS_DIR}" \
    --cache-dir "${RUNNER_CACHE_DIR}"
chmod 600 "${CONFIG}"
unset CI_SERVER_TOKEN

sed -i "s/^concurrent = .*/concurrent = ${RUNNER_CONCURRENT}/" "${CONFIG}"

run_pid=""
on_signal() {
    echo "[entrypoint] caught signal, shutting down"
    if [[ -n "${run_pid}" ]]; then
        kill -TERM -- -"${run_pid}" 2>/dev/null || true
        local waited=0
        while kill -0 "${run_pid}" 2>/dev/null && (( waited < 60 )); do
            sleep 1
            ((waited++))
        done
        wait "${run_pid}" 2>/dev/null || true
    fi
    if [[ "${RUNNER_UNREGISTER_ON_EXIT}" == "true" ]]; then
        gitlab-runner unregister --config "${CONFIG}" --all-runners || true
    fi
    if [[ -n "${port_forward_pid}" ]]; then
        kill -TERM "${port_forward_pid}" 2>/dev/null || true
    fi
    exit 0
}
trap on_signal SIGINT SIGTERM

port_forward_pid=""
if [[ -n "${DOCKER_HOST:-}" ]]; then
    mstudio-port-forward &
    port_forward_pid=$!
fi

setsid gitlab-runner run --config "${CONFIG}" --working-directory "${HOME}" &
run_pid=$!
wait "${run_pid}"
