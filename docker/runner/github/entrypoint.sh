#!/usr/bin/env bash
# Registers this container as a GitHub Actions self-hosted runner and runs it.
#
# Environment:
#   GITHUB_URL        https://github.com/<owner> (org runner) or https://github.com/<owner>/<repo>  [required]
#   RUNNER_TOKEN      registration token from the "New self-hosted runner" page, valid for one hour
#   GITHUB_TOKEN      PAT that may manage self-hosted runners; alternative to RUNNER_TOKEN,
#                     used to fetch registration and removal tokens
#   RUNNER_NAME       runner name (default: hostname)
#   RUNNER_LABELS     comma separated labels (default: mittwald)
#   RUNNER_GROUP      runner group (default: Default)
#   RUNNER_EPHEMERAL  "true" => one job per registration, re-registers afterwards; needs GITHUB_TOKEN (default: false)
#   RUNNER_WORKDIR    working directory (default: /home/runner/_work)
#   RUNNER_CONFIG_DIR directory that keeps the runner credentials across restarts (default: /home/runner/_config)
#   DISABLE_AUTO_UPDATE  "true" => --disableupdate
#
# Flow: a persisted registration from RUNNER_CONFIG_DIR is restored and reused.
# Without one, the runner registers with RUNNER_TOKEN or a token fetched via
# GITHUB_TOKEN and persists the result. Ephemeral runners register per job and
# persist nothing.
set -euo pipefail

: "${GITHUB_URL:?GITHUB_URL is required}"
RUNNER_NAME="${RUNNER_NAME:-$(hostname)}"
RUNNER_LABELS="${RUNNER_LABELS:-mittwald}"
RUNNER_GROUP="${RUNNER_GROUP:-Default}"
RUNNER_EPHEMERAL="${RUNNER_EPHEMERAL:-false}"
RUNNER_WORKDIR="${RUNNER_WORKDIR:-/home/runner/_work}"
RUNNER_CONFIG_DIR="${RUNNER_CONFIG_DIR:-/home/runner/_config}"
DISABLE_AUTO_UPDATE="${DISABLE_AUTO_UPDATE:-false}"
GITHUB_API="${GITHUB_API:-https://api.github.com}"

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

gh_api() {
    curl -fsSL -X POST \
        -H "Accept: application/vnd.github+json" \
        -H "Authorization: Bearer ${GITHUB_TOKEN}" \
        -H "X-GitHub-Api-Version: 2022-11-28" \
        "${GITHUB_API}/${api_path}/actions/runners/$1" | jq -r .token
}

registration_token() {
    if [[ -n "${GITHUB_TOKEN:-}" ]]; then
        gh_api registration-token
    else
        echo "${RUNNER_TOKEN}"
    fi
}

removal_token() {
    if [[ -n "${GITHUB_TOKEN:-}" ]]; then
        gh_api remove-token || true
    else
        echo "${RUNNER_TOKEN}"
    fi
}

config_files=(.runner .credentials .credentials_rsaparams)

persist_config() {
    [[ "${RUNNER_EPHEMERAL}" == "true" ]] && return 0
    mkdir -p "${RUNNER_CONFIG_DIR}" || return 0
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

clear_config() {
    for file in "${config_files[@]}"; do
        rm -f "${file}" "${RUNNER_CONFIG_DIR}/${file}"
    done
}

deregister() {
    echo "[entrypoint] removing runner ${RUNNER_NAME} from ${GITHUB_URL}"
    local token
    token="$(removal_token)"
    if [[ -n "${token}" && "${token}" != "null" ]]; then
        ./config.sh remove --token "${token}" || true
    fi
    clear_config
}

configure() {
    local args=(
        --unattended
        --replace
        --url "${GITHUB_URL}"
        --token "$(registration_token)"
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
        kill -INT "${run_pid}" 2>/dev/null || true
        wait "${run_pid}" 2>/dev/null || true
    fi
    deregister
    exit 0
}
trap on_signal SIGINT SIGTERM

while true; do
    if ! restore_config; then
        echo "[entrypoint] registering ${RUNNER_NAME} at ${GITHUB_URL} (labels: ${RUNNER_LABELS}, ephemeral: ${RUNNER_EPHEMERAL})"
        configure
    fi
    ./run.sh &
    run_pid=$!
    if wait "${run_pid}"; then
        run_status=0
    else
        run_status=$?
    fi
    run_pid=""
    if [[ "${RUNNER_EPHEMERAL}" != "true" ]]; then
        echo "[entrypoint] runner exited with status ${run_status}, container stops"
        if [[ "${run_status}" -ne 0 ]]; then
            clear_config
        else
            deregister
        fi
        exit "${run_status}"
    fi
    echo "[entrypoint] ephemeral job finished, re-registering"
done
