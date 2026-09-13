#!/usr/bin/env bash
# Registers this container as a GitHub Actions self-hosted runner and runs it.
#
# Environment:
#   GITHUB_URL        https://github.com/<owner> (org runner) or https://github.com/<owner>/<repo>  [required]
#   GITHUB_TOKEN      PAT that may manage self-hosted runners; used to fetch registration/removal tokens
#   RUNNER_TOKEN      registration token (alternative to GITHUB_TOKEN, expires after 1h)
#   RUNNER_NAME       runner name (default: hostname)
#   RUNNER_LABELS     comma separated labels (default: mittwald)
#   RUNNER_GROUP      runner group (default: Default)
#   RUNNER_EPHEMERAL  "true" => one job per registration, re-registers afterwards (default: false)
#   RUNNER_WORKDIR    working directory (default: /home/runner/_work)
#   DISABLE_AUTO_UPDATE  "true" => --disableupdate
set -euo pipefail

: "${GITHUB_URL:?GITHUB_URL is required}"
RUNNER_NAME="${RUNNER_NAME:-$(hostname)}"
RUNNER_LABELS="${RUNNER_LABELS:-mittwald}"
RUNNER_GROUP="${RUNNER_GROUP:-Default}"
RUNNER_EPHEMERAL="${RUNNER_EPHEMERAL:-false}"
RUNNER_WORKDIR="${RUNNER_WORKDIR:-/home/runner/_work}"
DISABLE_AUTO_UPDATE="${DISABLE_AUTO_UPDATE:-false}"
GITHUB_API="${GITHUB_API:-https://api.github.com}"

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
    if [[ -n "${RUNNER_TOKEN:-}" ]]; then
        echo "${RUNNER_TOKEN}"
    elif [[ -n "${GITHUB_TOKEN:-}" ]]; then
        gh_api registration-token
    else
        echo "either GITHUB_TOKEN or RUNNER_TOKEN is required" >&2
        exit 1
    fi
}

deregister() {
    echo "[entrypoint] removing runner ${RUNNER_NAME} from ${GITHUB_URL}"
    if [[ -n "${GITHUB_TOKEN:-}" ]]; then
        local token
        token="$(gh_api remove-token || true)"
        if [[ -n "${token}" && "${token}" != "null" ]]; then
            ./config.sh remove --token "${token}" || true
        fi
    fi
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

    if [[ -f .runner ]]; then
        rm -f .runner .credentials .credentials_rsaparams
    fi
    ./config.sh "${args[@]}"
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
    echo "[entrypoint] registering ${RUNNER_NAME} at ${GITHUB_URL} (labels: ${RUNNER_LABELS}, ephemeral: ${RUNNER_EPHEMERAL})"
    configure
    ./run.sh &
    run_pid=$!
    wait "${run_pid}" || true
    run_pid=""
    if [[ "${RUNNER_EPHEMERAL}" != "true" ]]; then
        echo "[entrypoint] runner exited, container stops"
        deregister
        exit 0
    fi
    echo "[entrypoint] ephemeral job finished, re-registering"
done
