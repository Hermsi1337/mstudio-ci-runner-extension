ARG RUNNER_VERSION

FROM ubuntu:24.04

ARG RUNNER_VERSION
ARG RUNNER_SHA256_AMD64
ARG RUNNER_SHA256_ARM64
ARG TARGETARCH

LABEL org.opencontainers.image.source="https://github.com/Hermsi1337/mstudio-ci-runner-extension" \
      org.opencontainers.image.description="GitHub Actions self-hosted runner for mittwald Container Hosting" \
      org.opencontainers.image.licenses="MIT" \
      org.opencontainers.image.vendor="codeBoarder - Inh. Dennis Hermsmeier"

ENV DEBIAN_FRONTEND=noninteractive \
    RUNNER_HOME=/home/runner \
    RUNNER_ALLOW_RUNASROOT=0

RUN apt-get update && apt-get install -y --no-install-recommends \
        ca-certificates curl git jq unzip zip tar gzip xz-utils \
        openssh-client rsync sudo build-essential \
        python3 python3-pip \
        libicu74 libkrb5-3 liblttng-ust1 libssl3 zlib1g \
    && rm -rf /var/lib/apt/lists/*

RUN useradd --create-home --home-dir ${RUNNER_HOME} --shell /bin/bash runner \
    && echo "runner ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/runner

WORKDIR ${RUNNER_HOME}

RUN case "${TARGETARCH:-$(uname -m)}" in \
        amd64|x86_64) ARCH=x64; SHA256="${RUNNER_SHA256_AMD64:?RUNNER_SHA256_AMD64 is required}" ;; \
        arm64|aarch64) ARCH=arm64; SHA256="${RUNNER_SHA256_ARM64:?RUNNER_SHA256_ARM64 is required}" ;; \
        *) echo "unsupported arch ${TARGETARCH:-$(uname -m)}" && exit 1 ;; \
    esac \
    && curl -fsSL -o runner.tar.gz \
        "https://github.com/actions/runner/releases/download/v${RUNNER_VERSION}/actions-runner-linux-${ARCH}-${RUNNER_VERSION}.tar.gz" \
    && echo "${SHA256}  runner.tar.gz" | sha256sum -c - \
    && tar xzf runner.tar.gz \
    && rm runner.tar.gz \
    && ./bin/installdependencies.sh \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir -p ${RUNNER_HOME}/data/work ${RUNNER_HOME}/data/config \
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

COPY --chown=runner:runner github/entrypoint.sh /entrypoint.sh
COPY --chown=runner:runner common/trim-cache.sh /usr/local/bin/trim-cache.sh
RUN chmod +x /entrypoint.sh /usr/local/bin/trim-cache.sh

COPY --chown=runner:runner common/mstudio-build common/mstudio-build-metadata common/mstudio-crane common/mstudio-dockerfile-check common/mstudio-image-store common/mstudio-platform-check common/docker-shim /usr/local/bin/
RUN chmod +x /usr/local/bin/mstudio-build /usr/local/bin/mstudio-build-metadata /usr/local/bin/mstudio-crane \
        /usr/local/bin/mstudio-dockerfile-check /usr/local/bin/mstudio-image-store \
        /usr/local/bin/mstudio-platform-check /usr/local/bin/docker-shim \
    && ln -s /usr/local/bin/docker-shim /usr/local/bin/docker

USER runner

VOLUME ["/home/runner/data"]

ENTRYPOINT ["/entrypoint.sh"]
