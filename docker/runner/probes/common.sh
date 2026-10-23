#!/usr/bin/env bash

expect_output "runs as user runner" "runner" id -un
expect "runs unprivileged" test "$(id -u)" -ne 0
expect_output "sudo gives root" "0" sudo -n id -u
expect "apt-get install works" sudo bash -c "apt-get update -qq && apt-get install -y -qq hello"

for tool in git curl jq unzip zip tar gzip xz rsync socat ssh python3 pip3 gcc make; do
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
expect_output "docker compose without DOCKER_HOST names the runner option" \
    "compose needs a Docker daemon, turn on Docker in jobs in the runner settings" \
    bash -c "unset DOCKER_HOST; ! docker compose up -d 2>&1"
expect_output "compose plugin is installed" "Docker Compose version" \
    bash -c "unset DOCKER_HOST; /usr/local/libexec/docker-cli/docker compose version"
expect_output "docker compose with DOCKER_HOST reaches the real CLI" "127.0.0.1:1" \
    bash -c "cd \$(mktemp -d) && printf 'services:\n  probe:\n    image: alpine\n' > compose.yaml && ! DOCKER_HOST=tcp://127.0.0.1:1 docker compose ps 2>&1"
expect "mstudio-port-forward executable" test -x /usr/local/bin/mstudio-port-forward
expect "mstudio-port-forward exits without DOCKER_HOST" bash -c "unset DOCKER_HOST; timeout 5 mstudio-port-forward"
expect_output "docker ps with DOCKER_HOST reaches the real CLI" "127.0.0.1:1" \
    bash -c "! DOCKER_HOST=tcp://127.0.0.1:1 docker ps 2>&1"
expect_output "docker inspect with DOCKER_HOST forwards unknown references" "127.0.0.1:1" \
    bash -c "! DOCKER_HOST=tcp://127.0.0.1:1 docker inspect probe-container 2>&1"
expect_output "docker info with DOCKER_HOST reaches the real CLI" "127.0.0.1:1" \
    bash -c "! DOCKER_HOST=tcp://127.0.0.1:1 docker info 2>&1"
expect_output "docker info without DOCKER_HOST describes the shim" "docker shim" \
    bash -c "unset DOCKER_HOST; docker info"
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

contexts_dir="$(mktemp -d)"
mkdir -p "${contexts_dir}/builds/queue" "${contexts_dir}/app" "${contexts_dir}/shared"
printf '*\n!Dockerfile\n' >"${contexts_dir}/app/.dockerignore"
echo shared >"${contexts_dir}/shared/file"
contexts_dockerfile() {
    printf '%s\n' "$@" >"${contexts_dir}/app/Dockerfile"
}
# Without a builder this returns only for a build that is refused before it is
# queued.
contexts_build() {
    (cd "${contexts_dir}/app" && BUILD_QUEUE_DIR="${contexts_dir}/builds" docker build "$@" -t probe:contexts . 2>&1)
}
# Stands in for the builder: keeps a copy of the first job and fails it, so
# the probe sees what the shim sends without building anything.
capture_job() {
    local request
    for _ in $(seq 100); do
        for request in "${contexts_dir}"/builds/queue/*/request; do
            if [[ -f "${request}" ]]; then
                cp -R "${request%/request}" "${contexts_dir}/job"
                echo exit=3 >"${request%/request}/result"
                return 0
            fi
        done
        sleep 0.1
    done
}

contexts_dockerfile "FROM alpine" "COPY --from=shared /file /file"
for refused in cache=oci-layout://cache app=target:build repo=git@github.com:me/repo.git; do
    expect_output "docker build refuses the build context ${refused}" \
        "takes a local directory or docker-image://REF" contexts_build --build-context "${refused}"
done
expect_output "docker build refuses a build context name that is no stage name" \
    "has to be a stage name" contexts_build --build-context alpine:3.20=docker-image://alpine:3.20
expect_output "docker build refuses a build context name given twice" \
    "shared is given twice" contexts_build --build-context shared=../shared --build-context shared=../shared
contexts_dockerfile "FROM alpine AS Shared" "FROM scratch"
expect_output "docker build refuses a build context named like a stage" \
    "has the name of a stage" contexts_build --build-context shared=../shared
contexts_dockerfile "FROM alpine" "COPY --from=shared ../app/Dockerfile /leaked"
expect_output "COPY --from a local context refuses a path above it" \
    "reaches outside the build context shared" contexts_build --build-context shared=../shared
contexts_dockerfile "FROM alpine" 'COPY --from=shared ["sub/../../app", "/leaked"]'
expect_output "COPY --from a local context refuses a path above it in the JSON form" \
    "reaches outside the build context shared" contexts_build --build-context shared=../shared

contexts_dockerfile \
    "# syntax=docker/dockerfile:1" \
    "ARG BASE=base" \
    "FROM \${BASE}" \
    "COPY --from=shared /file /file" \
    'COPY --from=shared ["file", "/json/"]' \
    "FROM scratch" \
    "COPY --from=0 /etc/os-release /os" \
    "RUN <<EOF" \
    "FROM alpine AS shared" \
    "COPY --from=shared /file /heredoc" \
    "EOF" \
    'COPY [".", "/app"]'
capture_job &
contexts_build --build-context shared=../shared --build-context=base=docker-image://alpine:3.20 \
    >"${contexts_dir}/build.log"
wait
rewritten="${contexts_dir}/job/context/.mstudio-contexts/Dockerfile"
expect_output "docker build sends --build-context with a rewritten Dockerfile" \
    "DOCKERFILE=.mstudio-contexts/Dockerfile" cat "${contexts_dir}/job/request"
expect_output "build contexts become stages after the global ARGs, COPY --from reads the local context" \
    "$(printf "ARG BASE=base\nFROM scratch AS shared\nCOPY .mstudio-contexts/shared/ /\nFROM alpine:3.20 AS base\nFROM \${BASE}\nCOPY .mstudio-contexts/shared/file /file\n")" \
    cat "${rewritten}"
expect_output "COPY --from a local context in the JSON form reads the local context" \
    'COPY [".mstudio-contexts/shared/file","/json/"]' cat "${rewritten}"
expect_output "a numbered COPY --from moves by the inserted stages" \
    "COPY --from=2 /etc/os-release /os" cat "${rewritten}"
expect_output "here-document bodies stay as they are" \
    "$(printf 'RUN <<EOF\nFROM alpine AS shared\nCOPY --from=shared /file /heredoc\nEOF\n')" cat "${rewritten}"
expect_output "a COPY of the whole main context in the JSON form gets a warning" \
    "Dockerfile:12: this COPY also copies .mstudio-contexts/" cat "${contexts_dir}/build.log"
expect "a local build context travels inside the main context" \
    test -f "${contexts_dir}/job/context/.mstudio-contexts/shared/file"
expect_output "an allowlist .dockerignore keeps the build contexts" \
    "$(printf '*\n!Dockerfile\n\n!.mstudio-contexts\n!.mstudio-contexts/**\n')" \
    cat "${contexts_dir}/job/context/.mstudio-contexts/Dockerfile.dockerignore"

mkdir -p "${contexts_dir}/app/sub" "${contexts_dir}/ci"
printf 'FROM alpine AS sub\n' >"${contexts_dir}/app/sub/Dockerfile"
echo sub-only >"${contexts_dir}/app/sub/Dockerfile.dockerignore"
printf 'FROM alpine\nCOPY --from=shared /file /ci\n' >"${contexts_dir}/ci/Dockerfile"
echo ci-only >"${contexts_dir}/ci/Dockerfile.dockerignore"
contexts_dockerfile "FROM alpine"
job_dockerfile="${contexts_dir}/job/context/.mstudio-contexts/Dockerfile"
# Runs docker build in a directory and keeps the job it queued in
# ${contexts_dir}/job.
captured_build() {
    local directory="$1"
    shift
    rm -rf "${contexts_dir}/job"
    capture_job &
    (cd "${directory}" && BUILD_QUEUE_DIR="${contexts_dir}/builds" docker build "$@" -t probe:file >"${contexts_dir}/build.log" 2>&1)
    wait
}

captured_build "${contexts_dir}/app" .
expect_output "docker build without -f sends the Dockerfile of the context" \
    "DOCKERFILE=Dockerfile" cat "${contexts_dir}/job/request"
expect "docker build without -f adds nothing to the context" \
    test ! -e "${contexts_dir}/job/context/.mstudio-contexts"
captured_build "${contexts_dir}" -f app/sub/Dockerfile app
expect_output "-f inside the context is relative to the working directory" \
    "DOCKERFILE=sub/Dockerfile" cat "${contexts_dir}/job/request"
captured_build / -f "${contexts_dir}/app/sub/Dockerfile" "${contexts_dir}/app"
expect_output "an absolute -f inside the context becomes a path in the context" \
    "DOCKERFILE=sub/Dockerfile" cat "${contexts_dir}/job/request"
expect_output "-f that misses the working directory says where it looked" \
    "relative to the working directory" \
    bash -c "cd ${contexts_dir} && BUILD_QUEUE_DIR=${contexts_dir}/builds docker build -f sub/Dockerfile app 2>&1"

captured_build "${contexts_dir}/app" -f ../ci/Dockerfile .
expect_output "-f outside the context travels as .mstudio-contexts/Dockerfile" \
    "DOCKERFILE=.mstudio-contexts/Dockerfile" cat "${contexts_dir}/job/request"
expect_output "-f outside the context arrives unchanged" \
    "$(cat "${contexts_dir}/ci/Dockerfile")" cat "${job_dockerfile}"
expect_output "-f outside the context takes the ignore file next to it and ignores .mstudio-contexts" \
    "$(printf 'ci-only\n\n.mstudio-contexts\n')" cat "${job_dockerfile}.dockerignore"
captured_build "${contexts_dir}/app" -f - . <"${contexts_dir}/ci/Dockerfile"
expect_output "-f - reads the Dockerfile from stdin" \
    "$(cat "${contexts_dir}/ci/Dockerfile")" cat "${job_dockerfile}"
expect_output "-f - takes the .dockerignore of the context" \
    "$(printf '*\n!Dockerfile\n\n.mstudio-contexts\n')" cat "${job_dockerfile}.dockerignore"

captured_build "${contexts_dir}/app" -f "${contexts_dir}/ci/Dockerfile" --build-context shared=../shared .
expect_output "an absolute -f outside the context gets the build contexts" \
    "$(printf 'FROM scratch AS shared\nCOPY .mstudio-contexts/shared/ /\nFROM alpine\nCOPY .mstudio-contexts/shared/file /ci\n')" \
    cat "${job_dockerfile}"
expect_output "-f outside the context with build contexts takes the ignore file next to it" \
    "$(printf 'ci-only\n\n!.mstudio-contexts\n')" cat "${job_dockerfile}.dockerignore"
captured_build "${contexts_dir}" -f app/sub/Dockerfile --build-context shared=shared app
expect_output "-f inside the context with build contexts is relative to the working directory" \
    "$(printf 'FROM scratch AS shared\nCOPY .mstudio-contexts/shared/ /\nFROM alpine AS sub\n')" cat "${job_dockerfile}"
expect_output "-f inside the context with build contexts takes the ignore file next to it" \
    "$(printf 'sub-only\n\n!.mstudio-contexts\n')" cat "${job_dockerfile}.dockerignore"

expect_output "setup-qemu-action gets the platforms of the builder" '"supported":["linux/' \
    docker run --rm --privileged tonistiigi/binfmt
expect_output "a pinned binfmt image gets the platforms of the builder" '"supported":["linux/' \
    docker run --rm --privileged docker.io/tonistiigi/binfmt:latest --install all
expect_output "qemu-user-static gets the platforms of the builder" '"supported":["linux/' \
    docker run --rm --privileged multiarch/qemu-user-static --reset -p yes
expect_output "docker run of another image fails although an argument names binfmt" "needs a Docker daemon" \
    bash -c "! docker run --rm -e MODE=binfmt alpine ls /proc/sys/fs/binfmt_misc 2>&1"
expect_output "buildx ls reports the platforms of the builder" "linux/$(dpkg --print-architecture)" docker buildx ls
