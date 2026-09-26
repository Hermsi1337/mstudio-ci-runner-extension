#!/usr/bin/env bash
# Registers this container as a GitHub Actions self-hosted runner and runs it.
#
# Environment:
#   GITHUB_URL        https://github.com/<owner> (org runner) or https://github.com/<owner>/<repo>  [required]
#   RUNNER_TOKEN      registration token from the "New self-hosted runner" page, valid for one hour
#   GITHUB_TOKEN      PAT that may manage self-hosted runners; alternative to RUNNER_TOKEN,
#                     used to fetch registration tokens
#   RUNNER_NAME       runner name (default: hostname)
#   RUNNER_LABELS     comma separated labels (default: mittwald)
#   RUNNER_GROUP      runner group (default: Default)
#   RUNNER_EPHEMERAL  "true" => one job per registration, re-registers afterwards; needs GITHUB_TOKEN (default: false)
#   RUNNER_DATA_DIR   persistent state, the data volume (default: /home/runner/data)
#   RUNNER_WORKDIR    working directory: checkouts, tool cache, actions (default: RUNNER_DATA_DIR/work)
#   RUNNER_CONFIG_DIR directory that keeps the runner credentials across restarts (default: RUNNER_DATA_DIR/config)
#   DISABLE_AUTO_UPDATE  "true" => --disableupdate
#   DOCKER_HOST       set by Docker in jobs; starts mstudio-port-forward, which makes ports
#                     published by the docker service reachable on localhost
#
# Flow: a persisted registration from RUNNER_CONFIG_DIR is restored and reused.
# Without one, the runner registers with RUNNER_TOKEN or a token fetched via
# GITHUB_TOKEN and persists the result. Ephemeral runners register per job and
# persist nothing.
#
# Shutdown never deregisters: mittwald recreates containers on updates and
# sends SIGTERM, and deregistering would brick registration-token runners
# whose token has since expired. GitHub-side removal happens outside the
# container; a broken registration is replaced by --replace on the next start.
set -euo pipefail

: "${GITHUB_URL:?GITHUB_URL is required}"
RUNNER_NAME="${RUNNER_NAME:-$(hostname)}"
RUNNER_LABELS="${RUNNER_LABELS:-mittwald}"
RUNNER_GROUP="${RUNNER_GROUP:-Default}"
RUNNER_EPHEMERAL="${RUNNER_EPHEMERAL:-false}"
RUNNER_DATA_DIR="${RUNNER_DATA_DIR:-/home/runner/data}"
# Runners created before the data volume mount work and config volumes
# at these paths. The image no longer creates them, so their presence means
# such a volume is mounted and the registration lives there.
if [[ -d /home/runner/_config ]]; then
    RUNNER_WORKDIR="${RUNNER_WORKDIR:-/home/runner/_work}"
    RUNNER_CONFIG_DIR="${RUNNER_CONFIG_DIR:-/home/runner/_config}"
fi
RUNNER_WORKDIR="${RUNNER_WORKDIR:-${RUNNER_DATA_DIR}/work}"
RUNNER_CONFIG_DIR="${RUNNER_CONFIG_DIR:-${RUNNER_DATA_DIR}/config}"
DISABLE_AUTO_UPDATE="${DISABLE_AUTO_UPDATE:-false}"
GITHUB_API="${GITHUB_API:-https://api.github.com}"

mkdir -p "${RUNNER_WORKDIR}" "${RUNNER_CONFIG_DIR}"

if [[ -z "${RUNNER_TOKEN:-}" && -z "${GITHUB_TOKEN:-}" ]]; then
    echo "either RUNNER_TOKEN or GITHUB_TOKEN is required" >&2
    exit 1
fi
if [[ "${RUNNER_EPHEMERAL}" == "true" && -z "${GITHUB_TOKEN:-}" ]]; then
    echo "RUNNER_EPHEMERAL=true needs GITHUB_TOKEN, a registration token expires after one hour" >&2
    exit 1
fi

path="${GITHUB_URL#https://github.com/}"
path="${path#http://github.com/}"
path="${path%/}"
if [[ "$path" == */* ]]; then
    api_path="repos/${path}"
else
    api_path="orgs/${path}"
fi

github_token="${GITHUB_TOKEN:-}"

gh_api() {
    curl -fsSL -X POST \
        -H "Accept: application/vnd.github+json" \
        -H "Authorization: Bearer ${github_token}" \
        -H "X-GitHub-Api-Version: 2022-11-28" \
        "${GITHUB_API}/${api_path}/actions/runners/$1" | jq -r .token
}

registration_token() {
    if [[ -n "${github_token:-}" ]]; then
        gh_api registration-token
    else
        echo "${RUNNER_TOKEN}"
    fi
}

config_files=(.runner .credentials .credentials_rsaparams)

persist_config() {
    [[ "${RUNNER_EPHEMERAL}" == "true" ]] && return 0
    for file in "${config_files[@]}"; do
        [[ -f "${file}" ]] && cp "${file}" "${RUNNER_CONFIG_DIR}/${file}"
    done
    echo "[entrypoint] registration persisted to ${RUNNER_CONFIG_DIR}"
}

restore_config() {
    [[ "${RUNNER_EPHEMERAL}" == "true" ]] && return 1
    [[ -f "${RUNNER_CONFIG_DIR}/.runner" ]] || return 1
    for file in "${config_files[@]}"; do
        [[ -f "${RUNNER_CONFIG_DIR}/${file}" ]] && cp "${RUNNER_CONFIG_DIR}/${file}" "${file}"
    done
    echo "[entrypoint] reusing registration from ${RUNNER_CONFIG_DIR}"
}

configure() {
    local token
    token="$(registration_token)"
    if [[ -z "${token}" || "${token}" == "null" ]]; then
        echo "[entrypoint] failed to obtain a registration token" >&2
        exit 1
    fi
    local args=(
        --unattended
        --replace
        --url "${GITHUB_URL}"
        --token "${token}"
        --name "${RUNNER_NAME}"
        --labels "${RUNNER_LABELS}"
        --runnergroup "${RUNNER_GROUP}"
        --work "${RUNNER_WORKDIR}"
    )
    [[ "${RUNNER_EPHEMERAL}" == "true" ]] && args+=(--ephemeral)
    [[ "${DISABLE_AUTO_UPDATE}" == "true" ]] && args+=(--disableupdate)

    rm -f "${config_files[@]}"
    ./config.sh "${args[@]}"
    persist_config
}

run_pid=""
on_signal() {
    echo "[entrypoint] caught signal, shutting down"
    if [[ -n "${run_pid}" ]]; then
        kill -INT -- -"${run_pid}" 2>/dev/null || true
        local waited=0
        while kill -0 "${run_pid}" 2>/dev/null && (( waited < 60 )); do
            sleep 1
            ((waited++))
        done
        if kill -0 "${run_pid}" 2>/dev/null; then
            kill -TERM -- -"${run_pid}" 2>/dev/null || true
            sleep 2
        fi
        wait "${run_pid}" 2>/dev/null || true
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

while true; do
    if ! restore_config; then
        echo "[entrypoint] registering ${RUNNER_NAME} at ${GITHUB_URL} (labels: ${RUNNER_LABELS}, ephemeral: ${RUNNER_EPHEMERAL})"
        configure
    fi
    unset RUNNER_TOKEN
    if [[ "${RUNNER_EPHEMERAL}" != "true" ]]; then
        unset GITHUB_TOKEN
    fi
    setsid ./run.sh &
    run_pid=$!
    if wait "${run_pid}"; then
        run_status=0
    else
        run_status=$?
    fi
    run_pid=""
    if [[ "${RUNNER_EPHEMERAL}" != "true" ]]; then
        echo "[entrypoint] runner exited with status ${run_status}, container stops"
        exit "${run_status}"
    fi
    echo "[entrypoint] ephemeral job finished, re-registering"
done
