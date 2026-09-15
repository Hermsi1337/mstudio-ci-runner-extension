#!/usr/bin/env bash
# Keeps a cache directory below a size limit by deleting the least recently
# modified files first. Called by a mittwald cronjob inside the runner container:
#   trim-cache.sh <directory> <max size in GB>
# Without the directory it does nothing.
set -euo pipefail

dir="${1:?usage: trim-cache.sh <directory> <max size in GB>}"
max_gb="${2:?usage: trim-cache.sh <directory> <max size in GB>}"
if [[ ! -d "${dir}" ]]; then
    exit 0
fi

limit_kb=$((max_gb * 1024 * 1024))
used_kb="$(du -sk "${dir}" | cut -f1)"
if (( used_kb <= limit_kb )); then
    echo "[trim-cache] ${dir} uses $((used_kb / 1024)) MiB, limit $((limit_kb / 1024)) MiB, nothing to do"
    exit 0
fi

echo "[trim-cache] ${dir} uses $((used_kb / 1024)) MiB, limit $((limit_kb / 1024)) MiB"
while IFS= read -r -d '' entry; do
    rest="${entry#* }"
    size_kb="${rest%% *}"
    path="${rest#* }"
    rm -f -- "${path}"
    used_kb=$((used_kb - size_kb))
    if (( used_kb <= limit_kb )); then
        break
    fi
done < <(find "${dir}" -type f -printf '%T@ %k %p\0' | sort -z -n)
find "${dir}" -mindepth 1 -type d -empty -delete
echo "[trim-cache] ${dir} now uses $((used_kb / 1024)) MiB"
