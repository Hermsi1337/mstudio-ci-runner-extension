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
| `deploy.yml` | After `extension-image.yml` on a tag, manual | Stack update on mittwald Container Hosting |

## Deployment to mittwald Container Hosting

The extension runs on Container Hosting itself. The stack is declared in
`deploy/mstudio/stack.yaml` and applied by `deploy.yml` through
[mittwald/deploy-container-action](https://github.com/mittwald/deploy-container-action).
The action replaces the whole stack with the file, so every manual change in mStudio
that is not in the file gets lost on the next deployment.

Target:

| | Value |
|---|---|
| Project | `c5d48ee8-73ed-45cc-8328-de9fd2257b29` |
| Stack | `7b83d0d4-9a5a-4613-a8f5-36e5eaa6844c` (`STACK_ID` in `deploy.yml`) |
| Services | `extension` (port 3000), `postgres` (`postgres:17-alpine`, volume `ci-runner-extension-postgres`) |

### Trigger

- Automatically after `extension-image.yml` succeeded for a `v*` tag. The job waits
  until `runner-image.yml` for the same tag has succeeded, then deploys that version.
- Manually via *Actions → Deploy → Run workflow* with a version such as `0.1.0`.

The version is written into the image tags of the extension and both runner images, so
a deployment pins all three to the same release. `postgres` is excluded from the
restart (`skip_recreation`); the extension runs its migrations on start.

### One-time setup

1. GitHub environment `mstudio` (exists) with these secrets:

   | Secret | Source |
   |---|---|
   | `MITTWALD_API_TOKEN` | mStudio, *User → API tokens*, needs access to the project |
   | `EXTENSION_ID`, `EXTENSION_SECRET` | Extension registration ([mstudio-setup.md](mstudio-setup.md)) |
   | `ENCRYPTION_MASTER_PASSWORD`, `ENCRYPTION_SALT` | Set. Changing them makes stored credentials unreadable. |
   | `POSTGRES_PASSWORD` | Set. Used by both services. |

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

Every server function call and webhook gets a `requestId`; lines written while the
request runs, including detached cleanup work, carry it together with `fn` (the
server function name in development, a hash prefix in production builds), `userId`,
`contextId` and `extensionInstanceId` once known. Filter
by `requestId` to follow one request across scopes.

Scopes: `startup` (configuration summary, migrations), `db`, `auth` (verified session
tokens, local mode), `server-function` (rejected and failed requests with the message
key), `runner` (stack lifecycle), `github` and `gitlab` (provider calls), `webhook`
(received events, instance cleanup). Tokens and environment values of runner
containers are never logged, only the variable names. The hosted stack runs with
`LOG_LEVEL=info` and `LOG_FORMAT=json` (`deploy/mstudio/stack.yaml`); raise to `debug`
there for troubleshooting and lower it again afterwards. Logs are visible in mStudio
under the container `extension`.

## Bumping the runner version

1. Raise `RUNNER_VERSION` in `docker/runner/<provider>/Dockerfile`, in the matrix of
   `runner-image.yml` and in [runner-image.md](runner-image.md).
2. `pnpm run test:integration`.
3. Push a tag. Running GitHub runners update themselves unless `DISABLE_AUTO_UPDATE` is
   set; GitLab runners and new images only affect fresh containers.
