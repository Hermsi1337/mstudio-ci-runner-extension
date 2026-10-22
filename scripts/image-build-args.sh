#!/usr/bin/env bash
# Prints the build arguments of one image as KEY=VALUE lines, read from
# docker/runner/versions.json and docker/builder/versions.json. The single source
# for scripts/build-runner-images.sh, the integration tests and the workflows.
#
# Usage: scripts/image-build-args.sh <github|gitlab|forgejo|builder>
set -euo pipefail

cd "$(dirname "$0")/.."

image="${1:-}"

case "${image}" in
    github | gitlab | forgejo)
        jq -r --arg provider "${image}" '
            [
                ["RUNNER_VERSION", .[$provider].version],
                ["RUNNER_SHA256_AMD64", .[$provider].sha256.amd64],
                ["RUNNER_SHA256_ARM64", .[$provider].sha256.arm64],
                ["CRANE_VERSION", .crane.version],
                ["CRANE_SHA256_AMD64", .crane.sha256.amd64],
                ["CRANE_SHA256_ARM64", .crane.sha256.arm64],
                ["DOCKER_CLI_VERSION", .dockerCli.version],
                ["DOCKER_CLI_SHA256_AMD64", .dockerCli.sha256.amd64],
                ["DOCKER_CLI_SHA256_ARM64", .dockerCli.sha256.arm64],
                ["DOCKER_COMPOSE_VERSION", .dockerCompose.version],
                ["DOCKER_COMPOSE_SHA256_AMD64", .dockerCompose.sha256.amd64],
                ["DOCKER_COMPOSE_SHA256_ARM64", .dockerCompose.sha256.arm64],
                ["NODE_VERSION", .node.version],
                ["NODE_SHA256_AMD64", .node.sha256.amd64],
                ["NODE_SHA256_ARM64", .node.sha256.arm64]
            ][]
            | "\(.[0])=\(.[1] // error("\(.[0]) is missing in docker/runner/versions.json"))"
        ' docker/runner/versions.json
        ;;
    builder)
        jq -r '
            [
                ["GO_VERSION", .kaniko.go],
                ["KANIKO_VERSION", .kaniko.version],
                ["KANIKO_REPOSITORY", .kaniko.repository],
                ["QEMU_VERSION", .qemu.version],
                ["QEMU_SNAPSHOT", .qemu.snapshot],
                ["QEMU_SHA256_AMD64", .qemu.sha256.amd64],
                ["QEMU_SHA256_ARM64", .qemu.sha256.arm64]
            ][]
            | "\(.[0])=\(.[1] // error("\(.[0]) is missing in docker/builder/versions.json"))"
        ' docker/builder/versions.json
        ;;
    *)
        echo "usage: $0 <github|gitlab|forgejo|builder>" >&2
        exit 2
        ;;
esac
