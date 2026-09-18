#!/usr/bin/env bash
# Builds container images for the runners of this stack.
#
# The runner container and this container share a directory in the project file
# system. The runner writes a job into BUILD_QUEUE_DIR, this loop picks it up,
# runs kaniko and writes the result back:
#
#   queue/<job>/context/      build context, written by the runner
#   queue/<job>/build-args    one KEY=VALUE per line (optional)
#   queue/<job>/labels        one KEY=VALUE per line (optional)
#   queue/<job>/request       job parameters, written last, claims the job
#   queue/<job>/log           kaniko output
#   queue/<job>/image.tar     built image
#   queue/<job>/result        "exit=<code>", written last, the job directory
#                             belongs to the runner so it can clean up again
#
# kaniko unpacks the base image into the root filesystem of this container, so
# the container is unusable afterwards and exits. The service runs with
# restartPolicy "always", which gives the next job a clean root filesystem.
# After kaniko has run, only shell builtins are left: every path that writes the
# result uses redirections and `read`, never `mv`, `basename` or `date`. bash
# itself keeps running from the open file, and the script it reads lives in
# /kaniko, which kaniko leaves alone.
#
# This container never receives registry credentials. It writes the image as a
# tarball, the runner pushes it.
#
# Environment:
#   BUILD_QUEUE_DIR  shared directory (default: /builds)
#   BUILD_TIMEOUT    seconds a single build may take (default: 3600)
#   BUILD_HEARTBEAT  seconds between "still waiting" lines (default: 300)
#   BUILD_MAX_AGE    hours after which a leftover job directory is deleted
#                    (default: 24)
set -u

queue_dir="${BUILD_QUEUE_DIR:-/builds}"
build_timeout="${BUILD_TIMEOUT:-3600}"
heartbeat="${BUILD_HEARTBEAT:-300}"
max_age_hours="${BUILD_MAX_AGE:-24}"

# The runner images run as a user whose uid depends on the base image, and the
# API has no field to set the user of a container, so the queue is writable for
# everyone with the sticky bit, like /tmp. Only containers of this project can
# reach the directory at all.
mkdir -p "${queue_dir}/queue"
chmod 1777 "${queue_dir}/queue"

# A runner that was killed mid job, and a builder that died while building,
# both leave a directory behind that nobody comes back for. Contexts are whole
# workspaces, so they would fill the project file system.
collect_leftovers() {
    local old
    while IFS= read -r old; do
        [ -n "${old}" ] || continue
        echo "[builder] removing leftover job ${old##*/}, older than ${max_age_hours}h"
        rm -rf "${old}"
    done < <(find "${queue_dir}/queue" -mindepth 1 -maxdepth 1 -type d \
        -mmin "+$((max_age_hours * 60))" 2>/dev/null)
}

collect_leftovers

# A builder that is replaced while it builds leaves its job claimed but without a
# result. Nothing claims a claimed job a second time, so the runner would wait
# for its whole MSTUDIO_BUILD_TIMEOUT. Only one builder runs per stack, so on
# startup every claimed job without a result belongs to a builder that is gone.
# Write a failing result at once, so the runner fails the build in seconds with a
# clear message instead of timing out.
fail_orphaned_jobs() {
    local claimed orphan
    for claimed in "${queue_dir}"/queue/*/request.claimed; do
        [ -f "${claimed}" ] || continue
        orphan="${claimed%/request.claimed}"
        [ -f "${orphan}/result" ] && continue
        echo "[builder] job ${orphan##*/} was claimed by a builder that did not finish, failing it"
        echo "[builder] the build container was replaced before the build finished, most likely killed. Start the build again." >>"${orphan}/log"
        echo "exit=1" >"${orphan}/result"
    done
}

fail_orphaned_jobs

job=""
job_id=""
dockerfile=Dockerfile
destination=""
target=""

claim_job() {
    for request in "${queue_dir}"/queue/*/request; do
        [ -f "${request}" ] || continue
        job="${request%/request}"
        job_id="${job##*/}"
        mv "${request}" "${job}/request.claimed" 2>/dev/null && return 0
    done

    return 1
}

read_request() {
    dockerfile=Dockerfile
    destination="mstudio-build:${job_id}"
    target=""
    while IFS='=' read -r key value; do
        case "${key}" in
            DOCKERFILE) dockerfile="${value}" ;;
            DESTINATION) destination="${value}" ;;
            TARGET) target="${value}" ;;
            '' | '#'*) ;;
            *) echo "[builder] ignoring unknown request key ${key}" ;;
        esac
    done <"${job}/request.claimed"
}

build() {
    set -- --context "dir://${job}/context" \
        --dockerfile "${dockerfile}" \
        --destination "${destination}" \
        --no-push \
        --tarPath "${job}/image.tar" \
        --ignore-path "${queue_dir}" \
        --verbosity info
    if [ -n "${target}" ]; then
        set -- "$@" --target "${target}"
    fi
    if [ -f "${job}/build-args" ]; then
        while IFS= read -r build_arg; do
            [ -n "${build_arg}" ] && set -- "$@" --build-arg "${build_arg}"
        done <"${job}/build-args"
    fi
    if [ -f "${job}/labels" ]; then
        while IFS= read -r label; do
            [ -n "${label}" ] && set -- "$@" --label "${label}"
        done <"${job}/labels"
    fi

    echo "[builder] ${job_id}: destination=${destination} dockerfile=${dockerfile}${target:+ target=${target}}"
    echo "[builder] ${job_id}: context $(du -sh "${job}/context" 2>/dev/null | cut -f1), $(find "${job}/context" -type f 2>/dev/null | wc -l) files"
    echo "[builder] ${job_id}: running kaniko, output goes to the job log and to the runner"
    started=${SECONDS}
    {
        timeout -s KILL "${build_timeout}" /kaniko/executor "$@"
        echo "$?" >"${job}/exit-code"
    } 2>&1 | tee "${job}/log"

    code=1
    read -r code <"${job}/exit-code"
    echo "exit=${code}" >"${job}/result"
    # kaniko has taken the filesystem apart by now, so this line and the exit
    # are the last things this container can still do.
    echo "[builder] ${job_id}: exit=${code} after $((SECONDS - started))s, replacing this container"
}

echo "[builder] ready, watching ${queue_dir}/queue, one build per container, timeout ${build_timeout}s"
waited=0
while :; do
    if ! claim_job; then
        sleep 2
        waited=$((waited + 2))
        if ((waited % heartbeat == 0)); then
            echo "[builder] idle, queue empty for ${waited}s"
        fi
        continue
    fi
    echo "[builder] claimed ${job_id}"
    read_request
    build
    exit 0
done
