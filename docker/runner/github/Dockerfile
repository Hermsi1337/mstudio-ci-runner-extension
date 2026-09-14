ARG RUNNER_VERSION

FROM ubuntu:26.04

ARG RUNNER_VERSION
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
        amd64|x86_64) ARCH=x64 ;; \
        arm64|aarch64) ARCH=arm64 ;; \
        *) echo "unsupported arch ${TARGETARCH:-$(uname -m)}" && exit 1 ;; \
    esac \
    && curl -fsSL -o runner.tar.gz \
        "https://github.com/actions/runner/releases/download/v${RUNNER_VERSION}/actions-runner-linux-${ARCH}-${RUNNER_VERSION}.tar.gz" \
    && tar xzf runner.tar.gz \
    && rm runner.tar.gz \
    && ./bin/installdependencies.sh \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir -p ${RUNNER_HOME}/data/work ${RUNNER_HOME}/data/config \
    && chown -R runner:runner ${RUNNER_HOME}

COPY --chown=runner:runner github/entrypoint.sh /entrypoint.sh
COPY --chown=runner:runner common/trim-cache.sh /usr/local/bin/trim-cache.sh
RUN chmod +x /entrypoint.sh /usr/local/bin/trim-cache.sh

USER runner

VOLUME ["/home/runner/data"]

ENTRYPOINT ["/entrypoint.sh"]
