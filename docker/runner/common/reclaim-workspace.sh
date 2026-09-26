#!/usr/bin/env bash
# Containers of a job often run as root and write into the workspace, which
# Docker in jobs keeps on the project file system. The next checkout runs as
# the runner user and fails on those files, so every job starts by taking them
# back. Called as the job-started hook (GitHub) or pre_get_sources_script
# (GitLab):
#   reclaim-workspace.sh [directory]   (default: MSTUDIO_WORK_ROOT)
set -euo pipefail

dir="${1:-${MSTUDIO_WORK_ROOT:-}}"
if [[ -z "${dir}" || ! -d "${dir}" ]]; then
    exit 0
fi
owner="$(id -un)"
sudo -n find "${dir}" -xdev ! -user "${owner}" -exec chown -h "${owner}:$(id -gn)" {} +
