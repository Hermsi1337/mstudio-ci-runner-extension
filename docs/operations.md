# Operations

## Release flow

Images are built from git tags only, never from pushes to `main`. `main` is verified
by `ci.yml` (codegen drift, Biome, `tsc`, build, integration tests).

```bash
git tag v0.2.0
git push origin v0.2.0
```

The tag is the single source of truth for the version. The extension image bakes it
in as `EXTENSION_VERSION`, so nothing depends on `package.json` at release time.
After the release, `release.yml` commits the tag version to `package.json` on `main`
(`chore: bump package.json to X.Y.Z`), so the fallback for local development stays
current on the next pull.

The tag triggers `release.yml`, which runs `extension-image.yml` and
`runner-image.yml` as reusable workflows and creates the GitHub release once both
succeeded. Both image workflows use `docker/metadata-action` and tag:

| Image | Tags for `v1.2.3` |
|---|---|
| `ghcr.io/hermsi1337/mstudio-ci-runner-extension` | `1.2.3`, `1.2`, `latest` |
| `ghcr.io/hermsi1337/mstudio-ci-runner-github` | `1.2.3`, `1.2`, `latest`, `runner-<RUNNER_VERSION>` (e.g. `runner-2.337.0`) |
| `ghcr.io/hermsi1337/mstudio-ci-runner-gitlab` | `1.2.3`, `1.2`, `latest`, `runner-<RUNNER_VERSION>` (e.g. `runner-19.3.1`) |

`workflow_dispatch` builds an image with a `sha-<commit>` tag only, without `latest`
and without the `runner-<RUNNER_VERSION>` alias, which are both gated to `v*` tag refs,
e.g. to try a branch.

The extension image receives the version as build arg `EXTENSION_VERSION` (baked in as
environment variable). The extension derives its default runner images from it, so
nothing runs on `latest`. The runner software versions come from
`docker/runner/versions.json` ([runner-image.md](runner-image.md)).

## Images

| Image | Source | Visibility |
|---|---|---|
| `ghcr.io/hermsi1337/mstudio-ci-runner-github` | `docker/runner/github/` | must be **public**, mittwald pulls it without credentials |
| `ghcr.io/hermsi1337/mstudio-ci-runner-gitlab` | `docker/runner/gitlab/` | must be **public** |
| `ghcr.io/hermsi1337/mstudio-ci-runner-extension` | `docker/extension/Dockerfile`, build context is the repo root, ignore rules in `docker/extension/Dockerfile.dockerignore` | any |

Package visibility is independent of the repository and can only be changed on the web:
*Packages → Package settings → Change visibility*. All images carry
`org.opencontainers.image.source` so `GITHUB_TOKEN` may push from the workflow, and
`org.opencontainers.image.licenses` (`MIT`, matching [LICENSE](../LICENSE)) and
`org.opencontainers.image.vendor`.

## Workflows

| Workflow | Trigger | Content |
|---|---|---|
| `ci.yml` | Push to `main`, pull requests | Codegen drift, Biome, `tsc`, build, integration tests |
| `extension-image.yml` | Called by `release.yml`, manual | Extension image |
| `runner-image.yml` | Called by `release.yml`, manual | Matrix over all providers, multi-arch |
| `deploy.yml` | After `release.yml` on a tag, manual | Stack update on mittwald Container Hosting |
| `release.yml` | Tags `v*` | Runs both image workflows as jobs, creates the GitHub release via `softprops/action-gh-release` (generated notes plus an image table with pull commands and the runner software versions), then commits the tag version to `package.json` on `main` |
| `pr-title.yml` | Pull requests | Rejects titles that do not follow Conventional Commits and labels the pull request with its type (`feat`, `fix`, ...) |

## Self-hosted runner

The repository has one runner created by this extension (label `mittwald`, in a
mittwald project of the maintainer). Jobs that need neither Docker nor tools that only
GitHub-hosted images ship run there:

| Job | Runner | Why |
|---|---|---|
| `ci.yml` `check` | `[self-hosted, mittwald]`, forks: `ubuntu-latest` | Node and pnpm come from `actions/setup-node` |
| `ci.yml` `integration` | `ubuntu-latest` | Testcontainers needs a Docker daemon |
| `release.yml` `verify` | `ubuntu-latest` | Runs the integration tests |
| `release.yml` `release`, `bump-version` | `[self-hosted, mittwald]` | `jq`, `git` and Node via `actions/setup-node` |
| `extension-image.yml`, `runner-image.yml`, `deploy.yml` | `ubuntu-latest` | Buildx with QEMU, Docker container action |
| `pr-title.yml` | `ubuntu-latest` | Needs `gh`, which the runner image does not ship |

Pull requests from forks never run on the self-hosted runner: `runs-on` switches to
`ubuntu-latest` when `github.event.pull_request.head.repo.fork` is true, because the
runner has passwordless sudo and reaches the project network
([architecture.md](architecture.md#trust-model-of-a-runner)). When the runner is
offline, `check`, `release` and `bump-version` wait in the queue until it is back; the
integration tests and image builds are not affected.

## Release notes and dependencies

`release.yml` (the workflow) creates the GitHub release for every tag once both image
workflows succeeded, so a release only exists when its images do. The notes are
generated from `.github/release.yml` (the config): the categories use the type labels
that `pr-title.yml` sets, so pull requests are squash-merged with their title as commit
subject. Dependabot updates arrive under `dependabot` and are excluded. The workflow
prepends a table with the three images, their pull commands and the runner software
versions from `docker/runner/versions.json`. The releases page is the changelog; there
is no `CHANGELOG.md`.

`.github/dependabot.yml` opens weekly pull requests for npm packages (grouped:
`@mittwald/*`, `@tanstack/*`, dev dependencies), GitHub Actions and the base images of
the three Dockerfiles. Bumped by hand, not by Dependabot: the Node LTS of the extension
image (`docker/extension/Dockerfile`, `@types/node`, `node-version` in `ci.yml`), the
Ubuntu LTS of the runner images, `nitro` (pinned to the last alpha whose build output
`server/index.mjs` the Dockerfile starts) and `drizzle-orm` (held at 0.44 by
`@weissaufschwarz/mitthooks-drizzle`).

## Deployment to mittwald Container Hosting

The extension runs on Container Hosting itself. The stack is declared in
`deploy/mstudio/stack.yaml` and applied by `deploy.yml` through
[mittwald/deploy-container-action](https://github.com/mittwald/deploy-container-action).
The action replaces the whole stack with the file, so every manual change in mStudio
that is not in the file gets lost on the next deployment.

The target stack comes from the GitHub environment (`MITTWALD_STACK_ID`), so the
repository holds no project or stack identifiers. The stack has two services:
`extension` (port 3000) and `postgres` (`postgres:17-alpine`, volume
`ci-runner-extension-postgres`). A fork deploys its own instance by pointing the
environment at its own project.

### Trigger

- Automatically after `release.yml` succeeded for a `v*` tag, so the images and the
  GitHub release exist before the deployment starts.
- Manually via *Actions → Deploy → Run workflow* with a version such as `0.1.0`.

`EXTENSION_VERSION` selects the extension image and, inside the extension, the runner
images, so a deployment pins all three to the same release. `postgres` is excluded from the
restart (`skip_recreation`); the extension runs its migrations on start.

After the stack the job `metadata` runs `pnpm run extension:sync` and writes the
marketplace texts, the logo and the fragment properties from
`deploy/mstudio/extension.yaml` into mStudio
([mstudio-setup.md](mstudio-setup.md#marketplace-entry-and-frontend-fragment)). Changes
made in mStudio are overwritten on the next deployment; scopes and webhook URLs are
untouched. For a published extension a changed text can trigger another review by
mittwald.

### One-time setup

1. GitHub environment `mstudio` with these secrets:

   | Name | Kind | Source |
   |---|---|---|
   | `MITTWALD_STACK_ID` | secret | An empty stack created in the target project in mStudio (*Container → Stacks → Create*) |
   | `MITTWALD_API_TOKEN` | secret | mStudio, *User → API tokens*, needs access to the project and to the extension |
   | `MITTWALD_CONTRIBUTOR_ID` | secret | Contributor of the extension, in mStudio under *Organization → Development* |
   | `EXTENSION_ID`, `EXTENSION_SECRET` | secret | Extension registration ([mstudio-setup.md](mstudio-setup.md)) |
   | `ENCRYPTION_MASTER_PASSWORD`, `ENCRYPTION_SALT` | secret | `pnpm run init:encryption` prints suitable values. Changing them later makes the stored instance secrets unreadable, so the cleanup after an uninstall stops working. |
   | `POSTGRES_PASSWORD` | secret | Any strong value. Used by both services. |

2. Image access. The extension image is private. Either set the package
   `mstudio-ci-runner-extension` to public, or create a registry in the project
   (*Container → Registries*, host `ghcr.io`, GitHub user plus a PAT with `read:packages`)
   before the first deployment. The runner images must be public in any case.
3. First deployment: run *Deploy* manually with the version to install.
4. Ingress: in mStudio create a domain or a mittwald subdomain for the project and route
   it to the container `extension`, port 3000. mittwald terminates TLS.
5. Enter that URL in the extension registration: webhooks
   `https://<domain>/api/webhooks/mittwald`, frontend fragment `https://<domain>/`.

### Manual stack changes

Environment variables, images and volumes belong in `deploy/mstudio/stack.yaml`, secrets
in the GitHub environment. After a change to the file, run *Deploy* with the current
version.

### Running locally as an image

```bash
pnpm run image:build
pnpm run db:start
docker run --rm --env-file .env -e POSTGRES_HOST=host.docker.internal -p 3000:3000 mstudio-ci-runner-extension:local
```

## Logging

The application logs to stdout (`debug`, `info`) and stderr (`warn`, `error`) through
`src/logger.ts`. Every line carries a timestamp, level, scope and message plus
key-value fields.

| Variable | Values |
|---|---|
| `LOG_LEVEL` | `debug`, `info` (default), `warn`, `error` |
| `LOG_FORMAT` | `json` (default with `NODE_ENV=production`), `text` |
| `NO_COLOR` | Set it to get `text` output without ANSI colors |

Every server function call and webhook gets a `requestId`; lines written while the
request runs, including detached cleanup work, carry it together with `fn` (the
server function name in development, a hash prefix in production builds), `userId`,
`contextId` and `extensionInstanceId` once known. Filter
by `requestId` to follow one request across scopes.

Scopes: `startup` (configuration summary, migrations), `db`, `auth` (verified session
tokens), `server-function` (rejected and failed requests with the message
key), `runner` (runner lifecycle), `stack` (stack lifecycle), `github` and `gitlab`
(provider calls), `webhook` (received events, instance cleanup), `changelog` (GitHub
release lookups). Tokens and environment values of runner
containers are never logged, only the variable names. The hosted stack runs with
`LOG_LEVEL=info` and `LOG_FORMAT=json` (`deploy/mstudio/stack.yaml`); raise to `debug`
there for troubleshooting and lower it again afterwards. Logs are visible in mStudio
under the container `extension`.

## Bumping the runner version

1. Raise `<provider>.version` in `docker/runner/versions.json` and replace the two
   `sha256` values. GitHub publishes them in the release notes of
   [actions/runner](https://github.com/actions/runner/releases) (`linux-x64` and
   `linux-arm64`); GitLab in `release.sha256` next to the binaries:

   ```bash
   curl -fsSL "https://gitlab-runner-downloads.s3.amazonaws.com/v${VERSION}/release.sha256" | grep -E 'binaries/gitlab-runner-linux-(amd64|arm64)$'
   ```

2. `pnpm run test:integration`. The image build fails when a checksum does not match.
3. Push a tag. Existing runners show an update in the UI once the new extension release
   is deployed; *Update* moves them to the new image. Running GitHub runners also update
   themselves unless `DISABLE_AUTO_UPDATE` is set.
