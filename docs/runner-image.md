# Runner images

One image per provider under `docker/runner/<provider>/`, built by
`.github/workflows/runner-image.yml` (matrix, multi-arch amd64/arm64, called by
`release.yml` on git tags only, see [operations.md](operations.md)) with `docker/runner` as build context, so every
image also gets `docker/runner/common/` (`trim-cache.sh`, the cache cleanup called by the
cronjob, see [providers.md](providers.md)). All images: Ubuntu 24.04, user `runner`, no
Docker daemon.

| Provider | Image | Base |
|---|---|---|
| github | `ghcr.io/hermsi1337/mstudio-ci-runner-github` | [actions/runner](https://github.com/actions/runner) release |
| gitlab | `ghcr.io/hermsi1337/mstudio-ci-runner-gitlab` | [gitlab-runner](https://gitlab.com/gitlab-org/gitlab-runner) binary, executor `shell` |

The runner software version per provider lives in `docker/runner/versions.json`
together with the SHA-256 checksums of the upstream binaries for amd64 and arm64:

```json
{ "github": { "version": "2.337.0", "sha256": { "amd64": "...", "arm64": "..." } } }
```

It is the only place to bump it: the workflow, `pnpm run runner:build`, the image test
and the extension (shown as runner version in the UI, `runnerVersion` on the provider)
read it. The Dockerfiles take `RUNNER_VERSION`, `RUNNER_SHA256_AMD64` and
`RUNNER_SHA256_ARM64` as build args without defaults and stop the build when the
downloaded binary does not match ([operations.md](operations.md#bumping-the-runner-version)).

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
   deregisters, because mittwald recreates the container on updates and a runner with an
   expired registration token could not register again

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
pnpm run runner:build     # both images locally as mstudio-ci-runner-<provider>:local
docker run --rm -e GITHUB_URL=https://github.com/owner/repo -e RUNNER_TOKEN=AEBI... mstudio-ci-runner-github:local
docker run --rm -e GITHUB_URL=https://github.com/owner/repo -e GITHUB_TOKEN=github_pat_... mstudio-ci-runner-github:local
docker run --rm -e CI_SERVER_URL=https://gitlab.com -e CI_SERVER_TOKEN=glrt-... mstudio-ci-runner-gitlab:local
```

Automated: `tests/integration/runner-image.test.ts` ([testing.md](testing.md)).

## Limitations

No Docker daemon. GitHub: `container:`, `services:`, `docker build` and Docker container
actions fail. GitLab: `image:` and `services:` are ignored by the shell executor; jobs
run directly in the Ubuntu userland.

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
