#!/usr/bin/env bash
# Declares this container as a Forgejo runner (host executor) and runs it.
# Forgejo created the runner already and showed UUID and token once; the
# runner presents both on every start, there is no registration step.
#
# Environment:
#   FORGEJO_INSTANCE_URL  Forgejo base URL, e.g. https://forgejo.example.com   [required]
#   FORGEJO_RUNNER_UUID   runner UUID from the runner page in Forgejo          [required]
#   FORGEJO_RUNNER_TOKEN  runner token from the runner page in Forgejo         [required]
#   RUNNER_NAME           name for the log output (default: hostname)
#   RUNNER_LABELS         comma separated labels, each registered as <label>:host (default: mittwald)
#   RUNNER_CAPACITY       jobs at once (default: 1)
#   RUNNER_DATA_DIR       persistent state, the data volume (default: /home/runner/data)
#   DOCKER_HOST           set by Docker in jobs; starts mstudio-port-forward, which makes ports
#                         published by the docker service reachable on localhost
#   MSTUDIO_WORK_ROOT     set by Docker in jobs: a directory of the project file system, mounted
#                         at its own path; the work directory moves there, so containers of a
#                         job can bind-mount the workspace
set -euo pipefail

: "${FORGEJO_INSTANCE_URL:?FORGEJO_INSTANCE_URL is required}"
: "${FORGEJO_RUNNER_UUID:?FORGEJO_RUNNER_UUID is required}"
: "${FORGEJO_RUNNER_TOKEN:?FORGEJO_RUNNER_TOKEN is required}"
RUNNER_NAME="${RUNNER_NAME:-$(hostname)}"
RUNNER_LABELS="${RUNNER_LABELS:-mittwald}"
RUNNER_CAPACITY="${RUNNER_CAPACITY:-1}"
RUNNER_DATA_DIR="${RUNNER_DATA_DIR:-/home/runner/data}"
RUNNER_WORK_DIR="${RUNNER_DATA_DIR}/work"
if [[ -n "${MSTUDIO_WORK_ROOT:-}" ]]; then
    RUNNER_WORK_DIR="${MSTUDIO_WORK_ROOT}/work"
fi
CONFIG_DIR="${HOME}/.forgejo-runner"
CONFIG="${CONFIG_DIR}/config.yml"

if [[ ! "${RUNNER_CAPACITY}" =~ ^[1-9][0-9]*$ ]]; then
    echo "RUNNER_CAPACITY must be a positive integer, got '${RUNNER_CAPACITY}'" >&2
    exit 1
fi

# The platform creates the mount point of the project file system as root.
if [[ -n "${MSTUDIO_WORK_ROOT:-}" && ! -w "${MSTUDIO_WORK_ROOT}" ]]; then
    sudo -n install -d -o runner -g runner "${MSTUDIO_WORK_ROOT}"
fi
mkdir -p "${RUNNER_WORK_DIR}" "${CONFIG_DIR}"

# forgejo-runner has no hook that runs before a job, so files that containers
# of earlier jobs wrote as root are only taken back when the runner starts.
if [[ -n "${MSTUDIO_WORK_ROOT:-}" ]]; then
    reclaim-workspace.sh "${RUNNER_WORK_DIR}"
fi

# Forgejo matches runs-on against the label name; the part after the colon
# picks the executor. Container Hosting has no container runtime, so every
# label runs its jobs on the host, which is this container.
labels_json="$(jq -cn --arg labels "${RUNNER_LABELS}" '
    $labels | split(",") | map(gsub("^\\s+|\\s+$"; "") | sub(":.*$"; ""))
    | map(select(length > 0)) | unique | map(. + ":host")')"
if [[ "${labels_json}" == "[]" ]]; then
    echo "RUNNER_LABELS must contain at least one label, got '${RUNNER_LABELS}'" >&2
    exit 1
fi

# YAML is a superset of JSON, so jq writes the config and takes care of
# quoting. The token goes into a file only the runner user can read instead
# of the command line, where every job could read it from /proc. The cache
# server stays off: its store would sit in the package manager cache volume
# and be trimmed by the cache cronjob.
(
    umask 077
    jq -n \
        --arg url "${FORGEJO_INSTANCE_URL}" \
        --arg uuid "${FORGEJO_RUNNER_UUID}" \
        --arg token "${FORGEJO_RUNNER_TOKEN}" \
        --arg runner_file "${CONFIG_DIR}/.runner" \
        --arg work_dir "${RUNNER_WORK_DIR}" \
        --argjson capacity "${RUNNER_CAPACITY}" \
        --argjson labels "${labels_json}" \
        '{
            log: { level: "info", job_level: "info" },
            runner: { file: $runner_file, capacity: $capacity, labels: $labels },
            cache: { enabled: false },
            host: { workdir_parent: $work_dir },
            server: { connections: { forgejo: { url: $url, uuid: $uuid, token: $token } } }
        }' >"${CONFIG}.tmp"
    mv "${CONFIG}.tmp" "${CONFIG}"
)
unset FORGEJO_RUNNER_TOKEN

if [[ -n "${DOCKER_HOST:-}" ]]; then
    mstudio-port-forward &
fi

echo "[entrypoint] starting ${RUNNER_NAME} for ${FORGEJO_INSTANCE_URL} (labels: $(jq -r 'join(",")' <<<"${labels_json}"), capacity: ${RUNNER_CAPACITY}, executor: host)"
exec forgejo-runner daemon --config "${CONFIG}"
