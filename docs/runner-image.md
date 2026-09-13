# Runner images

One image per provider under `docker/runner/<provider>/`, built by
`.github/workflows/runner-image.yml` (matrix, multi-arch amd64/arm64, on git tags only,
see [operations.md](operations.md)). All images: Ubuntu 24.04, user `runner`, no Docker
daemon.

| Provider | Image | Base | Version (build arg `RUNNER_VERSION`) |
|---|---|---|---|
| github | `ghcr.io/hermsi1337/mstudio-ci-runner-github` | [actions/runner](https://github.com/actions/runner) release | 2.337.0 |
| gitlab | `ghcr.io/hermsi1337/mstudio-ci-runner-gitlab` | [gitlab-runner](https://gitlab.com/gitlab-org/gitlab-runner) binary, executor `shell` | 19.3.1 |

## GitHub (`docker/runner/github/`)

`entrypoint.sh`:

1. Derives the API path from `GITHUB_URL` (`repos/<owner>/<repo>` or `orgs/<owner>`)
2. Fetches a registration token with `GITHUB_TOKEN` (or uses `RUNNER_TOKEN`)
3. `config.sh --unattended --replace ...`
4. `run.sh`; with `RUNNER_EPHEMERAL=true` re-registers after every job
5. On `SIGTERM`/`SIGINT`: removes the runner from GitHub (`config.sh remove`)

| Variable | Meaning | Default |
|---|---|---|
| `GITHUB_URL` | `https://github.com/<owner>` or `https://github.com/<owner>/<repo>` | required |
| `GITHUB_TOKEN` | PAT for registration/removal tokens | |
| `RUNNER_TOKEN` | Ready registration token, alternative to `GITHUB_TOKEN` | |
| `GITHUB_API` | API base URL | `https://api.github.com` |
| `RUNNER_NAME` | Runner name | hostname |
| `RUNNER_LABELS` | Comma separated labels | `mittwald` |
| `RUNNER_GROUP` | Runner group | `Default` |
| `RUNNER_EPHEMERAL` | `true` = one job per registration | `false` |
| `RUNNER_WORKDIR` | Working directory | `/home/runner/_work` |
| `DISABLE_AUTO_UPDATE` | `true` = `--disableupdate` | `false` |

Volume: `work:/home/runner/_work`.

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
| `RUNNER_BUILDS_DIR` | Builds directory | `/home/runner/builds` |
| `RUNNER_CACHE_DIR` | Cache directory | `/home/runner/cache` |
| `RUNNER_CONCURRENT` | Concurrent jobs | `1` |
| `RUNNER_UNREGISTER_ON_EXIT` | `true` = unregister on stop | `false` |

Tags and `run_untagged` are set by the extension via the API when creating the runner,
not inside the container. Volumes: `builds:/home/runner/builds`, `cache:/home/runner/cache`.

## Building and testing

```bash
pnpm run runner:build     # both images locally as mstudio-ci-runner-<provider>:local
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
