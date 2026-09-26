ARG GO_VERSION
ARG KANIKO_VERSION
ARG KANIKO_REPOSITORY

FROM --platform=${BUILDPLATFORM} golang:${GO_VERSION}-alpine AS kaniko

ARG KANIKO_VERSION
ARG KANIKO_REPOSITORY
ARG TARGETARCH

RUN apk add --no-cache git
RUN git clone --depth 1 --branch "${KANIKO_VERSION}" "${KANIKO_REPOSITORY}" /src
WORKDIR /src
COPY patches /patches
RUN git apply /patches/*.patch
RUN CGO_ENABLED=0 GOOS=linux GOARCH="${TARGETARCH}" \
    go build -ldflags "-w -s" -o /out/executor ./cmd/executor

# The builder emulates the other of the two architectures it supports: an amd64
# builder runs arm64 steps, an arm64 builder runs amd64 steps. Debian builds
# qemu-user as static binaries, which work in the empty root a build runs in.
# busybox of the other architecture is what the startup probe executes.
FROM --platform=${BUILDPLATFORM} alpine:3.22 AS emulation

ARG TARGETARCH
ARG QEMU_VERSION
ARG QEMU_SNAPSHOT
ARG QEMU_SHA256_AMD64
ARG QEMU_SHA256_ARM64

RUN apk add --no-cache bash binutils curl xz
SHELL ["/bin/bash", "-euo", "pipefail", "-c"]
RUN case "${TARGETARCH}" in \
        amd64) foreign=aarch64; sha256="${QEMU_SHA256_AMD64}" ;; \
        arm64) foreign=x86_64; sha256="${QEMU_SHA256_ARM64}" ;; \
        *) echo "unsupported architecture ${TARGETARCH}" >&2; exit 1 ;; \
    esac \
    && deb="qemu-user_${QEMU_VERSION#*:}_${TARGETARCH}.deb" \
    && curl -fsSL --retry 5 -o "/tmp/${deb}" \
        "https://snapshot.debian.org/archive/debian/${QEMU_SNAPSHOT}/pool/main/q/qemu/${deb//+/%2B}" \
    && echo "${sha256}  /tmp/${deb}" | sha256sum -c - \
    && mkdir -p /tmp/deb /out \
    && cd /tmp/deb && ar x "/tmp/${deb}" \
    && tar -xf data.tar.xz "./usr/bin/qemu-${foreign}" \
    && mv "usr/bin/qemu-${foreign}" /out/ \
    && cd /tmp && apk fetch --no-cache --arch "${foreign}" \
        --keys-dir "/usr/share/apk/keys/${foreign}" busybox-static \
    && tar -xzf busybox-static-*.apk bin/busybox.static \
    && mv bin/busybox.static "/out/busybox-${foreign}"

FROM alpine:3.22

ARG KANIKO_VERSION
ARG QEMU_VERSION

LABEL org.opencontainers.image.source="https://github.com/Hermsi1337/mstudio-ci-runner-extension" \
      org.opencontainers.image.description="Image builder for CI runners on mittwald Container Hosting" \
      org.opencontainers.image.licenses="MIT" \
      org.opencontainers.image.vendor="codeBoarder - Inh. Dennis Hermsmeier" \
      de.mittwald.ci-runner.kaniko-version="${KANIKO_VERSION}" \
      de.mittwald.ci-runner.qemu-version="${QEMU_VERSION}"

ENV BUILD_QUEUE_DIR=/builds \
    DOCKER_CONFIG=/kaniko/.docker

# kaniko unpacks the base image over the root file system of this container.
# Files only Alpine ships survive that unpack, and dpkg then finds them where a
# Debian package installs a conffile. It asks what to do, reads EOF from stdin
# and fails (procps with /etc/sysctl.conf). The other three have not collided
# yet and are removed as a precaution.
RUN apk add --no-cache ca-certificates bash setpriv util-linux-misc \
    && rm -f /etc/sysctl.conf /etc/inittab /etc/modules /etc/securetty

COPY --from=kaniko /out/executor /kaniko/executor
COPY --from=emulation /out/ /kaniko/emulation/
COPY --chown=0:0 loop.sh sandbox.sh /kaniko/
RUN chmod +x /kaniko/executor /kaniko/loop.sh /kaniko/sandbox.sh /kaniko/emulation/* \
    && mkdir -p /kaniko/.docker

ENTRYPOINT ["/bin/bash", "/kaniko/loop.sh"]
