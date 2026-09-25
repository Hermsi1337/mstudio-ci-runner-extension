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

FROM alpine:3.22

ARG KANIKO_VERSION

LABEL org.opencontainers.image.source="https://github.com/Hermsi1337/mstudio-ci-runner-extension" \
      org.opencontainers.image.description="Image builder for CI runners on mittwald Container Hosting" \
      org.opencontainers.image.licenses="MIT" \
      org.opencontainers.image.vendor="codeBoarder - Inh. Dennis Hermsmeier" \
      de.mittwald.ci-runner.kaniko-version="${KANIKO_VERSION}"

ENV BUILD_QUEUE_DIR=/builds \
    DOCKER_CONFIG=/kaniko/.docker

# kaniko unpacks the base image over the root file system of this container.
# Files only Alpine ships survive that unpack, and dpkg then finds them where a
# Debian package installs a conffile. It asks what to do, reads EOF from stdin
# and fails (procps with /etc/sysctl.conf). The other three have not collided
# yet and are removed as a precaution.
RUN apk add --no-cache ca-certificates bash \
    && rm -f /etc/sysctl.conf /etc/inittab /etc/modules /etc/securetty

COPY --from=kaniko /out/executor /kaniko/executor
COPY loop.sh /kaniko/loop.sh
RUN chmod +x /kaniko/executor /kaniko/loop.sh && mkdir -p /kaniko/.docker

ENTRYPOINT ["/bin/bash", "/kaniko/loop.sh"]
