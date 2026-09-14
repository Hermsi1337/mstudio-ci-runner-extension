ARG RUNNER_VERSION

FROM ubuntu:24.04

ARG RUNNER_VERSION
ARG TARGETARCH

LABEL org.opencontainers.image.source="https://github.com/Hermsi1337/mstudio-ci-runner-extension" \
      org.opencontainers.image.description="GitLab Runner (shell executor) for mittwald Container Hosting" \
      org.opencontainers.image.licenses="MIT"

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
        amd64|x86_64) ARCH=amd64 ;; \
        arm64|aarch64) ARCH=arm64 ;; \
        *) echo "unsupported arch ${TARGETARCH:-$(uname -m)}" && exit 1 ;; \
    esac \
    && curl -fsSL -o /usr/local/bin/gitlab-runner \
        "https://gitlab-runner-downloads.s3.amazonaws.com/v${RUNNER_VERSION}/binaries/gitlab-runner-linux-${ARCH}" \
    && chmod +x /usr/local/bin/gitlab-runner \
    && mkdir -p ${RUNNER_HOME}/.gitlab-runner ${RUNNER_HOME}/builds ${RUNNER_HOME}/cache \
    && chown -R runner:runner ${RUNNER_HOME}

COPY --chown=runner:runner entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

USER runner
WORKDIR ${RUNNER_HOME}

VOLUME ["/home/runner/builds", "/home/runner/cache"]

ENTRYPOINT ["/entrypoint.sh"]
