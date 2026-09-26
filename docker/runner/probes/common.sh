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
expect_output "docker build without a builder explains itself" "image builds are turned off" \
    bash -c "cd \$(mktemp -d) && echo FROM alpine > Dockerfile && docker build -t probe:local . 2>&1"

printf 'FROM scratch\n' >"${probe_dir}/Dockerfile.probe"
expect "dockerfile check accepts a plain Dockerfile" mstudio-dockerfile-check "${probe_dir}/Dockerfile.probe"
printf 'RUN --mount=type=cache,target=/root/.cache true\n' >"${probe_dir}/Dockerfile.mount"
expect "dockerfile check rejects BuildKit mounts" bash -c "! mstudio-dockerfile-check ${probe_dir}/Dockerfile.mount 2>/dev/null"
printf 'FROM --platform=linux/%s alpine\n' "$(dpkg --print-architecture)" >"${probe_dir}/Dockerfile.native"
expect "dockerfile check accepts FROM with the native platform" mstudio-dockerfile-check "${probe_dir}/Dockerfile.native"
printf 'FROM --platform=$BUILDPLATFORM alpine\n' >"${probe_dir}/Dockerfile.buildplatform"
expect "dockerfile check accepts FROM with BUILDPLATFORM" mstudio-dockerfile-check "${probe_dir}/Dockerfile.buildplatform"
case "$(dpkg --print-architecture)" in
    amd64) foreign_platform=linux/arm64 ;;
    *) foreign_platform=linux/amd64 ;;
esac
printf 'FROM --platform=%s alpine\n' "${foreign_platform}" >"${probe_dir}/Dockerfile.foreign"
expect "dockerfile check accepts FROM with the other architecture" mstudio-dockerfile-check "${probe_dir}/Dockerfile.foreign"
printf 'FROM --platform=linux/s390x alpine\n' >"${probe_dir}/Dockerfile.s390x"
expect "dockerfile check rejects FROM with an architecture the builder lacks" bash -c "! mstudio-dockerfile-check ${probe_dir}/Dockerfile.s390x 2>/dev/null"
expect "platform check accepts the native platform" mstudio-platform-check "linux/$(dpkg --print-architecture)"
expect_output "platform check accepts and normalizes both architectures" "linux/amd64 linux/arm64" \
    bash -c "mstudio-platform-check linux/amd64,aarch64,linux/arm64/v8 | tr '\n' ' '"
expect_output "platform check ignores spaces in the list" "linux/arm64 linux/amd64" \
    bash -c "mstudio-platform-check ' arm64 , linux/amd64,  linux/arm64/v8' | tr '\n' ' '"
expect "platform check rejects an architecture the builder lacks" bash -c "! mstudio-platform-check linux/s390x 2>/dev/null"
expect_output "a multi platform build without --push is refused" "needs --push" \
    bash -c "mstudio-build --platform linux/amd64,linux/arm64 -t probe:1 . 2>&1"
expect_output "setup-qemu-action gets the platforms of the builder" '"supported":["linux/' \
    docker run --rm --privileged tonistiigi/binfmt
expect_output "a pinned binfmt image gets the platforms of the builder" '"supported":["linux/' \
    docker run --rm --privileged docker.io/tonistiigi/binfmt:latest --install all
expect_output "qemu-user-static gets the platforms of the builder" '"supported":["linux/' \
    docker run --rm --privileged multiarch/qemu-user-static --reset -p yes
expect_output "docker run of another image fails although an argument names binfmt" "needs a Docker daemon" \
    bash -c "! docker run --rm -e MODE=binfmt alpine ls /proc/sys/fs/binfmt_misc 2>&1"
expect_output "buildx ls reports the platforms of the builder" "linux/$(dpkg --print-architecture)" docker buildx ls
