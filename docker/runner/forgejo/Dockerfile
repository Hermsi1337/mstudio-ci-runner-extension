ARG RUNNER_VERSION

FROM ubuntu:24.04

ARG RUNNER_VERSION
ARG RUNNER_SHA256_AMD64
ARG RUNNER_SHA256_ARM64
ARG TARGETARCH

LABEL org.opencontainers.image.source="https://github.com/Hermsi1337/mstudio-ci-runner-extension" \
      org.opencontainers.image.description="Forgejo Runner (host executor) for mittwald Container Hosting" \
      org.opencontainers.image.licenses="MIT" \
      org.opencontainers.image.vendor="codeBoarder - Inh. Dennis Hermsmeier"

ENV DEBIAN_FRONTEND=noninteractive \
    RUNNER_HOME=/home/runner \
    PATH=/home/runner/.npm-global/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

RUN apt-get update && apt-get install -y --no-install-recommends \
        ca-certificates curl git git-lfs jq unzip zip tar gzip xz-utils \
        openssh-client rsync sudo build-essential \
        python3 python3-pip tini \
    && rm -rf /var/lib/apt/lists/*

RUN useradd --create-home --home-dir ${RUNNER_HOME} --shell /bin/bash runner \
    && echo "runner ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/runner

RUN case "${TARGETARCH:-$(uname -m)}" in \
        amd64|x86_64) ARCH=amd64; SHA256="${RUNNER_SHA256_AMD64:?RUNNER_SHA256_AMD64 is required}" ;; \
        arm64|aarch64) ARCH=arm64; SHA256="${RUNNER_SHA256_ARM64:?RUNNER_SHA256_ARM64 is required}" ;; \
        *) echo "unsupported arch ${TARGETARCH:-$(uname -m)}" && exit 1 ;; \
    esac \
    && curl -fsSL -o /usr/local/bin/forgejo-runner \
        "https://code.forgejo.org/forgejo/runner/releases/download/v${RUNNER_VERSION}/forgejo-runner-${RUNNER_VERSION}-linux-${ARCH}" \
    && echo "${SHA256}  /usr/local/bin/forgejo-runner" | sha256sum -c - \
    && chmod +x /usr/local/bin/forgejo-runner \
    && mkdir -p ${RUNNER_HOME}/.forgejo-runner ${RUNNER_HOME}/data/work \
    && chown -R runner:runner ${RUNNER_HOME}

ARG NODE_VERSION
ARG NODE_SHA256_AMD64
ARG NODE_SHA256_ARM64

# The host executor runs JavaScript actions such as actions/checkout with the
# node it finds in PATH. Global npm installs go to the runner's home, so
# npm install -g works without sudo.
RUN case "${TARGETARCH:-$(uname -m)}" in \
        amd64|x86_64) NODE_ARCH=x64; NODE_SHA256="${NODE_SHA256_AMD64:?NODE_SHA256_AMD64 is required}" ;; \
        arm64|aarch64) NODE_ARCH=arm64; NODE_SHA256="${NODE_SHA256_ARM64:?NODE_SHA256_ARM64 is required}" ;; \
        *) echo "unsupported arch ${TARGETARCH:-$(uname -m)}" && exit 1 ;; \
    esac \
    && curl -fsSL -o node.tar.xz \
        "https://nodejs.org/dist/v${NODE_VERSION:?NODE_VERSION is required}/node-v${NODE_VERSION}-linux-${NODE_ARCH}.tar.xz" \
    && echo "${NODE_SHA256}  node.tar.xz" | sha256sum -c - \
    && tar xJf node.tar.xz -C /usr/local --strip-components=1 --no-same-owner \
    && rm node.tar.xz \
    && mkdir -p /usr/local/etc \
    && echo "prefix=${RUNNER_HOME}/.npm-global" > /usr/local/etc/npmrc \
    && install -d -o runner -g runner ${RUNNER_HOME}/.npm-global

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

COPY --chown=runner:runner forgejo/entrypoint.sh /entrypoint.sh
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

# forgejo-runner does not reap orphaned job processes, so tini runs as PID 1.
ENTRYPOINT ["/usr/bin/tini", "--", "/entrypoint.sh"]
