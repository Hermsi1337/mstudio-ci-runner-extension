#!/usr/bin/env bash
# Builds the runner images, the builder image and the Docker API image locally,
# with the build arguments from scripts/image-build-args.sh. Images are tagged
# mstudio-ci-runner-<provider>:<tag>, mstudio-ci-builder:<tag> and
# mstudio-ci-docker-api:<tag>, the tag defaults to "local". The tag "test" is the
# one the integration tests use with PREBUILT_IMAGES=1 (docs/testing.md).
#
# Usage: scripts/build-runner-images.sh [tag]
set -euo pipefail

cd "$(dirname "$0")/.."

tag="${1:-local}"

# Fills the array args with --build-arg flags. A command substitution instead of
# a process substitution, so a failing scripts/image-build-args.sh stops the script.
build_args() {
    local lines line
    lines="$(scripts/image-build-args.sh "$1")"
    args=()
    while IFS= read -r line; do
        args+=(--build-arg "${line}")
    done <<<"${lines}"
}

for provider in github gitlab forgejo; do
    echo "building mstudio-ci-runner-${provider}:${tag}"
    build_args "${provider}"
    docker build \
        -f "docker/runner/${provider}/Dockerfile" \
        "${args[@]}" \
        -t "mstudio-ci-runner-${provider}:${tag}" \
        docker/runner
done

echo "building mstudio-ci-builder:${tag}"
build_args builder
docker build \
    -f docker/builder/Dockerfile \
    "${args[@]}" \
    -t "mstudio-ci-builder:${tag}" \
    docker/builder

echo "building mstudio-ci-docker-api:${tag}"
docker build \
    -f docker/docker-api/Dockerfile \
    -t "mstudio-ci-docker-api:${tag}" \
    docker/docker-api
