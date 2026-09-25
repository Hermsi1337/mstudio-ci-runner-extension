ARG RUNNER_VERSION

FROM ubuntu:24.04

ARG RUNNER_VERSION
ARG RUNNER_SHA256_AMD64
ARG RUNNER_SHA256_ARM64
ARG TARGETARCH

LABEL org.opencontainers.image.source="https://github.com/Hermsi1337/mstudio-ci-runner-extension" \
      org.opencontainers.image.description="GitLab Runner (shell executor) for mittwald Container Hosting" \
      org.opencontainers.image.licenses="MIT" \
      org.opencontainers.image.vendor="codeBoarder - Inh. Dennis Hermsmeier"

ENV DEBIAN_FRONTEND=noninteractive \
    RUNNER_HOME=/home/runner

RUN apt-get update && apt-get install -y --no-install-recommends \
        ca-certificates curl git git-lfs jq unzip zip tar gzip xz-utils \
        openssh-client rsync sudo build-essential \
        python3 python3-pip \
    && rm -rf /var/lib/apt/lists/*

RUN useradd --create-home --home-dir ${RUNNER_HOME} --shell /bin/bash runner \
    && echo "runner ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/runner

RUN case "${TARGETARCH:-$(uname -m)}" in \
        amd64|x86_64) ARCH=amd64; SHA256="${RUNNER_SHA256_AMD64:?RUNNER_SHA256_AMD64 is required}" ;; \
        arm64|aarch64) ARCH=arm64; SHA256="${RUNNER_SHA256_ARM64:?RUNNER_SHA256_ARM64 is required}" ;; \
        *) echo "unsupported arch ${TARGETARCH:-$(uname -m)}" && exit 1 ;; \
    esac \
    && curl -fsSL -o /usr/local/bin/gitlab-runner \
        "https://gitlab-runner-downloads.s3.amazonaws.com/v${RUNNER_VERSION}/binaries/gitlab-runner-linux-${ARCH}" \
    && echo "${SHA256}  /usr/local/bin/gitlab-runner" | sha256sum -c - \
    && chmod +x /usr/local/bin/gitlab-runner \
    && mkdir -p ${RUNNER_HOME}/.gitlab-runner ${RUNNER_HOME}/data/builds ${RUNNER_HOME}/data/cache \
    && chown -R runner:runner ${RUNNER_HOME}

ARG CRANE_VERSION
ARG CRANE_SHA256_AMD64
ARG CRANE_SHA256_ARM64

RUN case "${TARGETARCH:-$(uname -m)}" in \
        amd64|x86_64) CRANE_ARCH=x86_64; CRANE_SHA256="${CRANE_SHA256_AMD64:?CRANE_SHA256_AMD64 is required}" ;; \
        arm64|aarch64) CRANE_ARCH=arm64; CRANE_SHA256="${CRANE_SHA256_ARM64:?CRANE_SHA256_ARM64 is required}" ;; \
        *) echo "unsupported arch ${TARGETARCH:-$(uname -m)}" && exit 1 ;; \
    esac \
    && curl -fsSL -o crane.tar.gz \
        "https://github.com/google/go-containerregistry/releases/download/${CRANE_VERSION:?CRANE_VERSION is required}/go-containerregistry_Linux_${CRANE_ARCH}.tar.gz" \
    && echo "${CRANE_SHA256}  crane.tar.gz" | sha256sum -c - \
    && tar xzf crane.tar.gz -C /usr/local/bin crane \
    && rm crane.tar.gz

ARG DOCKER_CLI_VERSION
ARG DOCKER_CLI_SHA256_AMD64
ARG DOCKER_CLI_SHA256_ARM64

# The real CLI stays off PATH: `docker` is the shim, which hands container
# commands to this binary only when DOCKER_HOST points at the docker service.
RUN case "${TARGETARCH:-$(uname -m)}" in \
        amd64|x86_64) DOCKER_ARCH=x86_64; DOCKER_SHA256="${DOCKER_CLI_SHA256_AMD64:?DOCKER_CLI_SHA256_AMD64 is required}" ;; \
        arm64|aarch64) DOCKER_ARCH=aarch64; DOCKER_SHA256="${DOCKER_CLI_SHA256_ARM64:?DOCKER_CLI_SHA256_ARM64 is required}" ;; \
        *) echo "unsupported arch ${TARGETARCH:-$(uname -m)}" && exit 1 ;; \
    esac \
    && curl -fsSL -o docker.tgz \
        "https://download.docker.com/linux/static/stable/${DOCKER_ARCH}/docker-${DOCKER_CLI_VERSION:?DOCKER_CLI_VERSION is required}.tgz" \
    && echo "${DOCKER_SHA256}  docker.tgz" | sha256sum -c - \
    && mkdir -p /usr/local/libexec/docker-cli \
    && tar xzf docker.tgz -C /usr/local/libexec/docker-cli --strip-components=1 docker/docker \
    && chmod 755 /usr/local/libexec/docker-cli/docker \
    && rm docker.tgz

COPY --chown=runner:runner gitlab/entrypoint.sh /entrypoint.sh
COPY --chown=runner:runner common/trim-cache.sh /usr/local/bin/trim-cache.sh
RUN chmod +x /entrypoint.sh /usr/local/bin/trim-cache.sh

COPY --chown=runner:runner common/mstudio-build common/mstudio-crane common/mstudio-dockerfile-check common/mstudio-image-store common/mstudio-platform-check common/docker-shim /usr/local/bin/
RUN chmod +x /usr/local/bin/mstudio-build /usr/local/bin/mstudio-crane \
        /usr/local/bin/mstudio-dockerfile-check /usr/local/bin/mstudio-image-store \
        /usr/local/bin/mstudio-platform-check /usr/local/bin/docker-shim \
    && ln -s /usr/local/bin/docker-shim /usr/local/bin/docker

USER runner
WORKDIR ${RUNNER_HOME}

VOLUME ["/home/runner/data"]

ENTRYPOINT ["/entrypoint.sh"]
