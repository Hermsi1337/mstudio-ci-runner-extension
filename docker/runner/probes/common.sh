#!/usr/bin/env bash

expect_output "runs as user runner" "runner" id -un
expect "runs unprivileged" test "$(id -u)" -ne 0
expect_output "sudo gives root" "0" sudo -n id -u
expect "apt-get install works" sudo bash -c "apt-get update -qq && apt-get install -y -qq hello"

for tool in git curl jq unzip zip tar gzip xz rsync ssh python3 pip3 gcc make; do
    expect "tool ${tool}" command -v "${tool}"
done

expect "HOME writable" touch "${HOME}/.probe-write"
expect "/tmp writable" touch /tmp/.probe-write

probe_dir="$(mktemp -d)"
echo probe >"${probe_dir}/file"
expect "symlink" ln -s file "${probe_dir}/link"
expect "hardlink" ln "${probe_dir}/file" "${probe_dir}/hard"
printf '#!/bin/sh\necho ok\n' >"${probe_dir}/run"
chmod +x "${probe_dir}/run"
expect_output "exec bit" "ok" "${probe_dir}/run"

expect "trim-cache.sh executable" test -x /usr/local/bin/trim-cache.sh

for tool in crane docker mstudio-build mstudio-image-store mstudio-crane; do
    expect "image build tool ${tool}" command -v "${tool}"
done

expect_output "docker is the shim" "docker shim" docker version
expect_output "buildx version parses like the real one" "github.com/docker/buildx v" docker buildx version
expect "bare docker buildx succeeds quietly" bash -c "docker buildx 2>/tmp/buildx.err && ! test -s /tmp/buildx.err"
expect_output "docker context inspect answers with the builder" "mstudio-builder" \
    docker context inspect --format "{{.Name}}"
expect_output "buildx create returns the builder name" "probe-builder" \
    docker buildx create --name probe-builder --driver docker-container --use
expect_output "buildx inspect reports a running node" "Status:    running" \
    docker buildx inspect --bootstrap
expect "docker run is rejected" bash -c "! docker run alpine 2>/dev/null"
expect "real docker CLI is installed" test -x /usr/local/libexec/docker-cli/docker
expect "real docker CLI stays off PATH" test "$(command -v docker)" = /usr/local/bin/docker
expect_output "docker run without DOCKER_HOST names the runner option" \
    "turn on Docker in jobs in the runner settings" \
    bash -c "unset DOCKER_HOST; ! docker run alpine 2>&1"
expect_output "docker ps with DOCKER_HOST reaches the real CLI" "127.0.0.1:1" \
    bash -c "! DOCKER_HOST=tcp://127.0.0.1:1 docker ps 2>&1"
expect_output "docker inspect with DOCKER_HOST forwards unknown references" "127.0.0.1:1" \
    bash -c "! DOCKER_HOST=tcp://127.0.0.1:1 docker inspect probe-container 2>&1"
expect_output "docker build without a builder explains itself" "image builds are turned off" \
    bash -c "cd \$(mktemp -d) && echo FROM alpine > Dockerfile && docker build -t probe:local . 2>&1"

printf 'FROM scratch\n' >"${probe_dir}/Dockerfile.probe"
expect "dockerfile check accepts a plain Dockerfile" mstudio-dockerfile-check "${probe_dir}/Dockerfile.probe"
printf 'RUN --mount=type=cache,target=/root/.cache true\n' >"${probe_dir}/Dockerfile.mount"
expect "dockerfile check rejects BuildKit mounts" bash -c "! mstudio-dockerfile-check ${probe_dir}/Dockerfile.mount 2>/dev/null"
expect "platform check accepts the native platform" mstudio-platform-check "linux/$(dpkg --print-architecture)"
expect "platform check rejects a foreign platform" bash -c "! mstudio-platform-check linux/s390x 2>/dev/null"
