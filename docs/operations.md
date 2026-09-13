# Operations

## Release flow

Images are built from git tags only, never from pushes to `main`. `main` is verified
by `ci.yml` (codegen drift, Biome, `tsc`, build, integration tests).

```bash
git tag v0.2.0
git push origin v0.2.0
```

The tag triggers `extension-image.yml` and `runner-image.yml`. Both use
`docker/metadata-action` and tag:

| Image | Tags for `v1.2.3` |
|---|---|
| `ghcr.io/hermsi1337/mstudio-ci-runner-extension` | `1.2.3`, `1.2`, `latest` |
| `ghcr.io/hermsi1337/mstudio-ci-runner-github` | `1.2.3`, `1.2`, `latest`, `<RUNNER_VERSION>` (e.g. `2.337.0`) |
| `ghcr.io/hermsi1337/mstudio-ci-runner-gitlab` | `1.2.3`, `1.2`, `latest`, `<RUNNER_VERSION>` (e.g. `19.3.1`) |

`workflow_dispatch` builds an image with a `sha-<commit>` tag and without `latest`,
e.g. to try a branch.

## Images

| Image | Source | Visibility |
|---|---|---|
| `ghcr.io/hermsi1337/mstudio-ci-runner-github` | `docker/runner/github/` | must be **public**, mittwald pulls it without credentials |
| `ghcr.io/hermsi1337/mstudio-ci-runner-gitlab` | `docker/runner/gitlab/` | must be **public** |
| `ghcr.io/hermsi1337/mstudio-ci-runner-extension` | `docker/extension/Dockerfile`, build context is the repo root, ignore rules in `docker/extension/Dockerfile.dockerignore` | any |

Package visibility is independent of the repository and can only be changed on the web:
*Packages → Package settings → Change visibility*. All images carry
`org.opencontainers.image.source` so `GITHUB_TOKEN` may push from the workflow.

## Workflows

| Workflow | Trigger | Content |
|---|---|---|
| `ci.yml` | Push to `main`, pull requests | Codegen drift, Biome, `tsc`, build, integration tests |
| `extension-image.yml` | Tags `v*`, manual | Extension image |
| `runner-image.yml` | Tags `v*`, manual | Matrix over all providers, multi-arch |

## Running the extension

Requires PostgreSQL and the environment variables from [development.md](development.md).
The extension can run on mittwald Container Hosting itself: a stack with the services
extension (port 3000) and PostgreSQL, HTTPS via an ingress to the extension. With a
private extension image, create a registry with a GHCR token in the project first.

Locally as an image:

```bash
pnpm run image:build
pnpm run db:start
docker run --rm --env-file .env -e POSTGRES_HOST=host.docker.internal -p 3000:3000 mstudio-ci-runner-extension:local
```

## Bumping the runner version

1. Raise `RUNNER_VERSION` in `docker/runner/<provider>/Dockerfile`, in the matrix of
   `runner-image.yml` and in [runner-image.md](runner-image.md).
2. `pnpm run test:integration`.
3. Push a tag. Running GitHub runners update themselves unless `DISABLE_AUTO_UPDATE` is
   set; GitLab runners and new images only affect fresh containers.
