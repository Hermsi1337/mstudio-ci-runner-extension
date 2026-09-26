#!/usr/bin/env bash
# Builds the runner images and the builder image locally, with the versions and
# checksums from docker/runner/versions.json and docker/builder/versions.json.
# Images are tagged mstudio-ci-runner-<provider>:local and mstudio-ci-builder:local.
set -euo pipefail

cd "$(dirname "$0")/.."

runner_versions="docker/runner/versions.json"
builder_versions="docker/builder/versions.json"

crane_version="$(jq -r .crane.version "${runner_versions}")"
crane_sha256_amd64="$(jq -r .crane.sha256.amd64 "${runner_versions}")"
crane_sha256_arm64="$(jq -r .crane.sha256.arm64 "${runner_versions}")"

for provider in github gitlab; do
    echo "building mstudio-ci-runner-${provider}:local"
    docker build \
        -f "docker/runner/${provider}/Dockerfile" \
        --build-arg "RUNNER_VERSION=$(jq -r ".${provider}.version" "${runner_versions}")" \
        --build-arg "RUNNER_SHA256_AMD64=$(jq -r ".${provider}.sha256.amd64" "${runner_versions}")" \
        --build-arg "RUNNER_SHA256_ARM64=$(jq -r ".${provider}.sha256.arm64" "${runner_versions}")" \
        --build-arg "CRANE_VERSION=${crane_version}" \
        --build-arg "CRANE_SHA256_AMD64=${crane_sha256_amd64}" \
        --build-arg "CRANE_SHA256_ARM64=${crane_sha256_arm64}" \
        -t "mstudio-ci-runner-${provider}:local" \
        docker/runner
done

echo "building mstudio-ci-builder:local"
docker build \
    -f docker/builder/Dockerfile \
    --build-arg "GO_VERSION=$(jq -r .kaniko.go "${builder_versions}")" \
    --build-arg "KANIKO_VERSION=$(jq -r .kaniko.version "${builder_versions}")" \
    --build-arg "KANIKO_REPOSITORY=$(jq -r .kaniko.repository "${builder_versions}")" \
    --build-arg "QEMU_VERSION=$(jq -r .qemu.version "${builder_versions}")" \
    --build-arg "QEMU_SNAPSHOT=$(jq -r .qemu.snapshot "${builder_versions}")" \
    --build-arg "QEMU_SHA256_AMD64=$(jq -r .qemu.sha256.amd64 "${builder_versions}")" \
    --build-arg "QEMU_SHA256_ARM64=$(jq -r .qemu.sha256.arm64 "${builder_versions}")" \
    -t mstudio-ci-builder:local \
    docker/builder
