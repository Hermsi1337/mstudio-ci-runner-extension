# Runner images

One image per provider under `docker/runner/<provider>/`, built by
`.github/workflows/runner-image.yml` (matrix, `linux/amd64` only because Container
Hosting runs on amd64, called by
`release.yml` on git tags only, see [operations.md](operations.md)) with `docker/runner` as build context, so every
image also gets `docker/runner/common/`: `trim-cache.sh`, the cache cleanup called by the
cronjob (see [providers.md](providers.md)), `reclaim-workspace.sh` for Docker in jobs, and the tools for image builds, `docker-shim`
plus `mstudio-build`, `mstudio-image-store`, `mstudio-crane`, `mstudio-dockerfile-check`
and `mstudio-platform-check` ([image-builds.md](image-builds.md)), and `mstudio-port-forward`
([Docker in jobs](#docker-in-jobs)). Both images also ship
the static docker CLI from download.docker.com at `/usr/local/libexec/docker-cli/docker`,
the docker compose plugin from the [docker/compose](https://github.com/docker/compose)
releases at `/usr/local/lib/docker/cli-plugins/docker-compose` and `socat`.
The CLI is not on `PATH`: `docker` is always the shim, which calls the real CLI for container
commands and `compose` when `DOCKER_HOST` is set ([Docker in jobs](#docker-in-jobs)). All images: Ubuntu
24.04, user `runner`, no Docker daemon.

| Provider | Image | Base |
|---|---|---|
| github | `ghcr.io/hermsi1337/mstudio-ci-runner-github` | [actions/runner](https://github.com/actions/runner) release |
| gitlab | `ghcr.io/hermsi1337/mstudio-ci-runner-gitlab` | [gitlab-runner](https://gitlab.com/gitlab-org/gitlab-runner) binary, executor `shell` |

The runner software version per provider lives in `docker/runner/versions.json`
together with the SHA-256 checksums of the upstream binaries for amd64 and arm64, next to
the `crane` version the images ship for pushing built images, the docker CLI version
under `dockerCli` (checksums of the `.tgz` archives) and the docker compose plugin version
under `dockerCompose` (checksums of the `docker-compose-linux-x86_64` and
`docker-compose-linux-aarch64` binaries). CI builds amd64 only, the
arm64 checksum is what `pnpm run runner:build` needs on an Apple Silicon machine:

```json
{ "github": { "version": "2.337.0", "sha256": { "amd64": "...", "arm64": "..." } } }
```

It is the only place to bump them: the workflow, `pnpm run runner:build`, the image test
and the extension (shown as runner version in the UI, `runnerVersion` on the provider)
read it. The Dockerfiles take `RUNNER_VERSION`, `RUNNER_SHA256_AMD64`,
`RUNNER_SHA256_ARM64`, `CRANE_VERSION`, `CRANE_SHA256_AMD64`, `CRANE_SHA256_ARM64`,
`DOCKER_CLI_VERSION`, `DOCKER_CLI_SHA256_AMD64`, `DOCKER_CLI_SHA256_ARM64`,
`DOCKER_COMPOSE_VERSION`, `DOCKER_COMPOSE_SHA256_AMD64` and `DOCKER_COMPOSE_SHA256_ARM64` as build args
without defaults and stop the build when a downloaded binary does not match ([operations.md](operations.md#bumping-the-runner-version)).

The extension creates runners from `ghcr.io/hermsi1337/mstudio-ci-runner-<provider>:<EXTENSION_VERSION>`,
the same release as the extension itself. A runner created by an older release shows an
update in the UI; *Update* redeclares its stack with the current image.

## GitHub (`docker/runner/github/`)

`entrypoint.sh`:

1. Restores a persisted registration (`.runner`, `.credentials*`) from `RUNNER_CONFIG_DIR`
   and skips registration when one exists
2. Otherwise takes `RUNNER_TOKEN`, or fetches a registration token with `GITHUB_TOKEN`
   from the API path derived from `GITHUB_URL` (`repos/<owner>/<repo>` or `orgs/<owner>`)
3. `config.sh --unattended --replace ...`, then persists the registration to
   `RUNNER_CONFIG_DIR` (not for ephemeral runners)
4. Unsets `RUNNER_TOKEN` (and `GITHUB_TOKEN` unless ephemeral), then `run.sh`; with
   `RUNNER_EPHEMERAL=true` re-registers after every job, which needs `GITHUB_TOKEN`
   because a registration token expires after one hour
5. On `SIGTERM`/`SIGINT`: stops the runner process group with a bounded wait. It never
   deregisters, because the extension recreates the container on updates and settings
   changes and a runner with an expired registration token could not register again

The extension only uses `RUNNER_TOKEN`. `GITHUB_TOKEN` and `RUNNER_EPHEMERAL=true` stay
in the image for hand-built stacks and for
[issue #25](https://github.com/Hermsi1337/mstudio-ci-runner-extension/issues/25), but
put a long-lived credential into a container where every job has sudo.

| Variable | Meaning | Default |
|---|---|---|
| `GITHUB_URL` | `https://github.com/<owner>` or `https://github.com/<owner>/<repo>` | required |
| `RUNNER_TOKEN` | Registration token from the "New self-hosted runner" page, valid for one hour | |
| `GITHUB_TOKEN` | PAT for registration tokens, alternative to `RUNNER_TOKEN`, required for ephemeral runners. Not set by the extension | |
| `GITHUB_API` | API base URL | `https://api.github.com` |
| `RUNNER_NAME` | Runner name | hostname |
| `RUNNER_LABELS` | Comma separated labels | `mittwald` |
| `RUNNER_GROUP` | Runner group | `Default` |
| `RUNNER_EPHEMERAL` | `true` = one job per registration. Not set to `true` by the extension | `false` |
| `RUNNER_DATA_DIR` | Persistent state, mount point of the data volume | `/home/runner/data` |
| `RUNNER_WORKDIR` | Working directory: checkouts, downloaded actions, `_tool` (tool cache of the `setup-*` actions) | `RUNNER_DATA_DIR/work` |
| `RUNNER_CONFIG_DIR` | Keeps the registration across restarts | `RUNNER_DATA_DIR/config` |
| `DISABLE_AUTO_UPDATE` | `true` = `--disableupdate` | `false` |

The variables for image builds (`BUILD_QUEUE_DIR`, `MSTUDIO_IMAGE_STORE`,
`MSTUDIO_INSECURE_REGISTRIES`, `MSTUDIO_BUILD_TIMEOUT`) are in
[image-builds.md](image-builds.md#setting-it-up). The extension sets none of them.

Volumes: `data:/home/runner/data`, optionally `cache:/home/runner/.cache`
(see [Volumes](#volumes)).

## GitLab (`docker/runner/gitlab/`)

`entrypoint.sh`:

1. `gitlab-runner register --non-interactive --executor shell` with `CI_SERVER_URL`
   and `CI_SERVER_TOKEN` (runner token `glrt-...`, created by the extension via API)
2. `gitlab-runner run`
3. On `SIGTERM`/`SIGINT`: stops the process; unregisters only with
   `RUNNER_UNREGISTER_ON_EXIT=true` (the extension deletes the runner via API itself)

| Variable | Meaning | Default |
|---|---|---|
| `CI_SERVER_URL` | GitLab base URL | required |
| `CI_SERVER_TOKEN` | Runner authentication token | required |
| `RUNNER_NAME` | Description/name | hostname |
| `RUNNER_DATA_DIR` | Persistent state, mount point of the data volume | `/home/runner/data` |
| `RUNNER_BUILDS_DIR` | Builds directory | `RUNNER_DATA_DIR/builds` |
| `RUNNER_CACHE_DIR` | Directory for the `cache:` keyword of GitLab CI | `RUNNER_DATA_DIR/cache` |
| `RUNNER_CONCURRENT` | Concurrent jobs | `1` |
| `RUNNER_UNREGISTER_ON_EXIT` | `true` = unregister on stop | `false` |

Tags and `run_untagged` are set by the extension via the API when creating the runner,
not inside the container. Volumes: `data:/home/runner/data`, optionally
`cache:/home/runner/.cache` (see [Volumes](#volumes)).

## Volumes

Every runner gets exactly one volume, `data`, mounted at `/home/runner/data`. In the
stack the names carry the service as prefix: `runner-<slug>-data`, `runner-<slug>-cache`.
The entrypoints create the subdirectories on start because the mount hides the ones
from the image. mittwald volumes have no `description`, so the create form lists what
gets created and why.

| Volume | Mount | Content | When |
|---|---|---|---|
| `data` | `/home/runner/data` | GitHub: `config/` (registration), `work/` (checkouts, actions, tool cache). GitLab: `builds/`, `cache/` | always |
| `cache` | `/home/runner/.cache` | Package manager caches, trimmed by a cronjob ([providers.md](providers.md#package-manager-cache)) | cache enabled |

`work/` grows with one checkout per repository plus the toolchains of the `setup-*`
actions. Without a volume that data would land in the container layer, which is lost
on every recreate and not meant for gigabytes. The registration in `config/` is
required: a GitHub registration token expires after one hour, so a runner without the
persisted `.credentials` cannot register again after a recreate.

The cache is a separate volume so its usage shows up on its own in mStudio and turning
the cache off frees the space. Runners created before this layout keep their `work`,
`config`, `builds` and `cache` volumes until they are deleted and created again. The
entrypoints detect those mounts (`/home/runner/_config`, `/home/runner/builds`) and keep
using them, so an image update does not lose the GitHub registration. The cache switch
works for them as well.

## Building and testing

```bash
pnpm run runner:build     # both runner images as mstudio-ci-runner-<provider>:local, plus mstudio-ci-builder:local
docker run --rm -e GITHUB_URL=https://github.com/owner/repo -e RUNNER_TOKEN=AEBI... mstudio-ci-runner-github:local
docker run --rm -e GITHUB_URL=https://github.com/owner/repo -e GITHUB_TOKEN=github_pat_... mstudio-ci-runner-github:local
docker run --rm -e CI_SERVER_URL=https://gitlab.com -e CI_SERVER_TOKEN=glrt-... mstudio-ci-runner-gitlab:local
```

Automated: `tests/integration/runner-image.test.ts` ([testing.md](testing.md)).

## Docker in jobs

With Docker in jobs turned on for a runner, the extension sets
`DOCKER_HOST=tcp://docker:2375` in the runner container. `docker` in the same stack is a
service that speaks the Docker Engine API and runs every container as a service of the
stack ([docker-api.md](docker-api.md)). Testcontainers, dockerode and other clients that
read `DOCKER_HOST` talk to it directly.

| Variable | Meaning | Default |
|---|---|---|
| `DOCKER_HOST` | Docker API for container commands. Set by the extension when Docker in jobs is on. The shim forwards `docker run`, `exec`, `ps`, `compose` and the other container commands to the real CLI only when it is set, and the entrypoint starts `mstudio-port-forward` | unset |
| `MSTUDIO_WORK_ROOT` | Directory on the project file system for this runner, mounted at its own path. Set by the extension with Docker in jobs. GitHub moves its work directory to `<root>/work` (also for a restored registration), GitLab its `builds_dir` to `<root>/builds`. Every job starts with `reclaim-workspace.sh`, which gives files that containers wrote as root back to the runner user (GitHub: `ACTIONS_RUNNER_HOOK_JOB_STARTED` unless already set, GitLab: `pre_get_sources_script`) | unset |
| `MSTUDIO_EXTERNALS_ROOT` | GitHub only: where the entrypoint copies the externals once per runner version. It exports `MSTUDIO_EXTERNALS` with the copy, and the shim rewrites mounts of `/home/runner/externals` to it, so `container:` jobs find node | unset |

The `docker` service publishes container ports on itself: `docker run -p 5432:5432 postgres`
listens on `docker:5432`, and `docker port` prints `0.0.0.0:<port>` meaning that port on
the host `docker`. Jobs and GitHub `services:` expect it on localhost, so the entrypoint
starts `mstudio-port-forward` in the background when `DOCKER_HOST` is set. Every second it
lists the published ports with `docker ps` and keeps one `socat` per port that forwards
`127.0.0.1:<port>` to `docker:<port>` (the host part of `DOCKER_HOST`). After `run`,
`create`, `start`, `restart` and `compose` the shim wakes it with `SIGUSR1`, so a
detached container is reachable on localhost as soon as the command returns. A port that
disappears loses its forwarder. A port already taken on localhost is skipped with one line
in the container log, the container stays reachable at `docker:<port>`. The forwarder
logs to the container log with the prefix `[port-forward]`, only on changes. UDP ports are
not forwarded.

The forwarder sees every port the `docker` service published, also those of containers
started by another runner in the same stack. A stack is the trust boundary: runners that
must not reach each other's containers belong in separate stacks.

`docker compose` goes to the compose plugin of the real CLI, which talks to the same
Docker API. Published ports of compose services reach localhost the same way.

`docker build` stays with the builder service, the Docker API builds no images. The
commands the shim forwards and the ones it still refuses are in
[image-builds.md](image-builds.md#what-docker-in-jobs-forwards).

## Limitations

No Docker daemon in the runner. Without Docker in jobs nothing that starts a container
works: `docker run` and the other container commands fail with a message. With it,
`docker run`, `docker compose`, Testcontainers and GitHub `services:` work, while `container:` jobs
and Docker container actions do not; the list with workarounds is in
[docker-api.md](docker-api.md#known-issues). In GitLab `image:` and `services:` are
ignored by the shell executor; jobs run directly in the Ubuntu userland.

`docker build` works: the `docker` in the image is a shim that hands the build to the
builder service of the stack and pushes with crane. What it supports, fills in, warns
about and refuses is in [image-builds.md](image-builds.md).

## Workflow examples

```yaml
# GitHub Actions
jobs:
  build:
    runs-on: [self-hosted, mittwald]
    steps:
      - uses: actions/checkout@v4
      - run: npm ci && npm test
```

```yaml
# GitLab CI
build:
  tags: [mittwald]
  script:
    - npm ci
    - npm test
```

```yaml
# GitHub Actions with Docker in jobs turned on for the runner
jobs:
  test:
    runs-on: [self-hosted, mittwald]
    steps:
      - uses: actions/checkout@v4
      - run: docker run --rm alpine:3.20 echo ok
      - run: docker run -d -p 5432:5432 -e POSTGRES_PASSWORD=test postgres:17
      - run: pg_isready -h localhost -p 5432   # forwarded by mstudio-port-forward
      - run: npm ci && npm test   # Testcontainers reads DOCKER_HOST
```
