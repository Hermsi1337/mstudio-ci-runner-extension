# Tests

Unit tests run with `pnpm run test`, integration tests start their own containers
with `pnpm run test:integration`. Read on when you add a test or a container.

## Setup

Vitest with two projects (`config/vitest.config.ts`):

| Project | Files | Command |
|---|---|---|
| `unit` | `src/**/*.test.ts`, `config/**/*.test.ts` (i18n catalog checks, logger, version compare, release note cleanup, error mapping, secret hashing of the service `docker`, resource limits, their phrasing and the form mapping of the "No limit" checkboxes) | `pnpm run test` |
| `integration` | `tests/integration/**/*.test.ts` | `pnpm run test:integration` |

Integration tests start their dependencies themselves with
[Testcontainers](https://node.testcontainers.org/) directly through Docker. No Docker
Compose. Files run one after another (`fileParallelism: false`), tests within a file in
order.

## Containers

| Helper | Container | Use |
|---|---|---|
| `tests/helpers/postgres.ts` | `postgres:16-alpine` | Sets `POSTGRES_*`, applies migrations from `src/db/migrations/` |
| `tests/helpers/prism.ts` | `stoplight/prism:5.14.2` | Mock server from `openapi/upstream/<name>.json` (mittwald, GitHub, GitLab); validates every request against the spec and answers with spec-conformant example data |
| `tests/helpers/images.ts` | builds `docker/runner/<provider>/` and `docker/builder/` | Images `mstudio-ci-runner-<provider>:test` and `mstudio-ci-builder:test`, used by `runner-image.test.ts` and `image-build.test.ts` ([Repository images](#repository-images)) |
| `tests/helpers/server.ts` | none, runs `pnpm run build` and `node .output/server/index.mjs` | The built extension on a free port, calls server functions over HTTP ([Server functions](#server-functions)) |
| `tests/helpers/session-token.ts` | none, a local HTTP server | Stands in for `MW_EXT_API_URL`: public key and access token exchange for session tokens signed with a key pair per run |
| `tests/integration/image-build.test.ts` | the builder and the GitHub runner from `tests/helpers/images.ts`, plus two `registry:2` (one open, one with an htpasswd login) | Image builds end to end: runner, builder and a registry on one network, the queue directory as a bind mount |

The probe suite in `docker/runner/probes/` runs inside the built images.
`probe.sh` provides `expect` and `expect_output`, `common.sh` holds the checks every
image passes (user `runner`, sudo, `apt-get install`, toolchain, writable paths,
symlinks, exec bit, `trim-cache.sh`, the image build tools, `socat`, the compose plugin,
`mstudio-port-forward`, the commands the docker shim forwards with `DOCKER_HOST` set and the rejections of the docker shim, and `docker build --build-context`: the refused inputs (OCI layout, `target:`, git, a name that is no stage name, given twice or named like a stage, a `COPY --from=` source that leads outside the context in shell and JSON form), and what it queues, which a stand-in builder copies: the rewritten Dockerfile (stages after the global `ARG`, `COPY --from=` reading the local context in shell and JSON form, a numbered `--from` shifted, here-document bodies unchanged), the warning for a JSON form `COPY` of the whole main context, the copied local context and the `.dockerignore` that keeps it despite an allowlist), and `docker build -f` resolved against the working directory: the queued `DOCKERFILE` without `-f`, with a relative, an absolute and a symlinked `-f` inside the context, the resolved path when a file or directory link on the way has an absolute target, a hint when a relative `-f` misses and none for an absolute one, a Dockerfile outside the context (also in a sibling directory with the prefix of the context and behind a symlink) and from stdin (`-f -`) sent as `.mstudio-contexts/Dockerfile` with the right ignore file, an empty stdin and an existing `.mstudio-contexts` refused before a job is queued, and these layouts together with `--build-context`. A probe build that queues no job fails and prints its log. `<provider>.sh` adds the runner binary and
asserts its version against `docker/runner/versions.json`
(`EXPECTED_RUNNER_VERSION`). `github.sh` checks that the runner's `externals/node24` and
`externals/node20` run `node.version` (`EXPECTED_NODE_VERSION`). `forgejo.sh` also checks
Node against `node.version` (`EXPECTED_NODE_VERSION`) and installs a local package with `npm install -g` as the
runner user, so a Node bump cannot break global installs silently, and checks that
`tini` reaps orphaned processes. `runner-image.test.ts` compares the image entrypoint
per provider (Forgejo starts through `tini`). All of it runs without credentials, so it works on
every pull request, forks included.

`stoplight/prism:5` (latest) crashes on start (`isPrimary`), hence the pinned version.
The image exists for amd64 only. On an arm64 host it runs under QEMU emulation: Docker
Desktop ships it, CI installs it with `docker/setup-qemu-action` in the arm64 leg of
`integration`.

Ubuntu 24.04 sets `kernel.apparmor_restrict_unprivileged_userns=1`, which takes the
capabilities away from an unconfined process in a user namespace it created. The
emulated builds of the builder need them, so `ci.yml` `integration` and `release.yml`
`verify` set the sysctl to `0` before the integration tests. A local Ubuntu 24.04 host needs the same, or the emulation tests fail
with `EMULATION` other than `namespace`.

`tests/helpers/env.ts` sets the extension environment. Defaults only fill missing
variables, overrides always win. Modules such as `src/db/schema.ts` read the environment
on import, so tests import them after the containers started via `await import(...)`.

## Repository images

`tests/helpers/images.ts` builds the runner images and the builder image under their
`:test` tags, with the build arguments that `scripts/image-build-args.sh` prints from
`docker/runner/versions.json` and `docker/builder/versions.json`. Locally every run of
`pnpm run test:integration` builds them, served from the local layer cache after the
first run.

CI builds them beforehand: the composite action `.github/actions/test-images` runs
`docker/build-push-action` per image with a layer cache in the GitHub Actions cache
(scope `<image>-<amd64|arm64>`), and the tests run with `PREBUILT_IMAGES=1`. With it set
the helper only checks that the tag exists and fails if it does not. The same path
works locally:

```bash
pnpm run runner:build test
PREBUILT_IMAGES=1 pnpm run test:integration
```

## Server functions

`server-functions.test.ts` calls every server function of the built extension over
HTTP, as the browser does, so the middleware in `src/middleware/`, the zod validators and
the error body run unchanged. `beforeAll` runs `pnpm run build` (a few seconds) next to the
container starts, so the test never sees a stale `.output`, and CI needs no extra step.

Authentication goes through the real path. `@mittwald/ext-bridge/node` reads
`MW_EXT_API_URL` and calls `GET /v2/public-keys/{serial}` and
`POST /v2/authenticate-session-token`; `tests/helpers/session-token.ts` answers both and
signs session tokens with an Ed25519 key it generates per run. `MITTWALD_API_URL` and
`GITHUB_API_URL` point at Prism as in the other tests.

`tests/helpers/server.ts` speaks the wire format of the TanStack Start client, which
couples it to TanStack internals:

- The URL is `/_serverFn/<id>`, the id is the SHA-256 of
  `<file>--<export>_createServerFn_handler`, which the build derives the same way.
- Payloads and responses are seroval JSON (`seroval` is a dev dependency for this), read
  with `defaultSerovalDeserializerPlugins` from `@tanstack/react-start`.
- Results and thrown errors both arrive with status 200 as `{ result }` or `{ error }`.
  The helper throws on any other status, which is what a changed id scheme after a
  TanStack upgrade looks like (`Server function info not found`).

## Test files

| File | Verifies |
|---|---|
| `database.test.ts` | Migrations, encrypted instance secret, no secret column in `runners`, cascade delete |
| `runner-lifecycle.test.ts` | Per provider case (GitHub repo, three GitLab runner token variants, Forgejo with labels and capacity): `createRunner` → `listRunners` → logs/restart → update (declare and recreate) → settings → `deleteRunner` against the mittwald and GitLab Prism mocks (Forgejo needs no mock, the extension never calls it); image builds on and off; Docker in jobs on and off, the token endpoint accepting only the secret of its stack and only while the service is kept, and refusing the option without `PUBLIC_URL`; two runners sharing a stack; a second GitHub runner with the same name for the same target rejected in any project before a service is declared, while another target and two GitLab runners accept the name; a custom runner without a memory limit, then without any limit, to a preset and back, plus one created without any limit (a spy on `container.updateStack` reads the declared `deploy.resources`, since Prism does not echo them); a runner in a stack the user picked (no `runner_stacks` row, stack survives the delete, stacks of another project and stacks the extension manages are rejected, service names are checked against the stack); tenant isolation; input errors |
| `runner-image.test.ts` | Per image: gets the image from `provideRepositoryImage` (prebuilt in CI, built from `docker/runner/versions.json` locally), entrypoint reaches registration with the configured values (Forgejo: labels as `<label>:host`, capacity), runs as user `runner`, passes the probe suite (GitHub: patched Node in `externals`), entrypoint rejects missing required variables with a clear message |
| `image-build.test.ts` | `docker build --push` from the runner through the builder into a registry, image id and metadata file match the pushed digest, edits of base image files land in the layer despite `--snapshot-mode=redo` (same size with a new mtime, a deletion, a new owner only), a failing build keeps its exit code, the predefined platform arguments (`TARGETARCH` and friends) are set in a native build, `docker buildx build` with a local `--build-context` used by `COPY --from=` and a `docker-image://` context used by `FROM` (a global `ARG` keeps its value, an allowlist `.dockerignore` in the main context and the `.dockerignore` of the extra context both apply, nothing of `.mstudio-contexts` lands in the image), `docker build -f` with a Dockerfile outside the context (the `Dockerfile.dockerignore` next to it wins over the `.dockerignore` of the context, nothing of `.mstudio-contexts` lands in the image), `apt-get install procps` on a Debian base image passes (Alpine files like `/etc/sysctl.conf` must not collide with conffiles), both on the fallback path and in the sandbox, a base image with file capabilities builds with a warning on the fallback path, BuildKit only features and an architecture without emulator in `FROM` are refused before a job is queued. For the other architecture (arm64 on an amd64 host, amd64 on an arm64 host): a `COPY`-only image and a cross-compiled Go binary without emulation, checked by the architecture in the image config and the ELF machine of the binary; the explanation of `exec format error` when the builder found no emulation; `RUN` under qemu in the sandbox; a base image with file capabilities in the sandbox; `docker buildx build --platform linux/amd64,linux/arm64 --push` into the registry with a login, which has to end up as one index under the only tag, with the index digest in `--iidfile` and `--metadata-file` ([image-builds.md](image-builds.md)). Three tags in two repositories of the two registries end up at one digest, with a single platform (the manifest) and with two platforms (the index), and `crane ls` shows no other tag. Failure paths: one platform of a multi platform `--push` fails, nothing is pushed and the tag keeps its digest; the upload to a second repository without a login fails and the tag in the first repository keeps its digest; a tag PUT fails after others moved (a `crane` wrapper in `PATH` refuses it, because `registry:2` accepts every tag once the upload passed), the tag that existed before goes back to its digest and the new one stays; two runners queue a build at the same time and each gets its own image; the builder is killed mid build and the runner fails within a minute; `BUILD_TIMEOUT` ends a `RUN sleep` on both paths and the builder exits; the runner takes back a job no builder claimed within `--timeout`; one foreign platform without `--push` lands in the image store with that architecture, several platforms without `--push` are refused; a native build with a literal `FROM --platform` of the other architecture runs its `RUN` under qemu; `exec format error` in a build without `--platform` gets the explanation for the native platform; the platform list is normalized (`linux/arm64/v8`, `arm64`, spaces) and `linux/s390x` is refused. Every test starts its own builder, because kaniko destroys the container it builds in. Builds for several platforms need one builder per job, `superviseBuilders` starts the next one when the last one exited. The builder gets the capabilities of a Container Hosting container (no `SETFCAP`, `MKNOD`, `NET_RAW`, `SYS_CHROOT`, `AUDIT_WRITE`) and, like there, no seccomp filter and no AppArmor profile (`seccomp=unconfined`, `apparmor=unconfined`). Docker's default seccomp profile blocks `unshare`, only the tests of the fallback path keep it. With `IMAGE_EXPORT_DIR` set, the multi platform test also writes the image of the other architecture there as `linux-<arch>.tar`, see [below](#emulated-images-on-native-hardware) |
| `changelog.test.ts` | `getChangelog` against the GitHub Prism mock: releases parsed and validated, second call served from the cache, releases newer than `EXTENSION_VERSION` hidden |
| `server-functions.test.ts` | Every server function over HTTP against the built server: a call without a session token and one with altered claims get the generic error body; per function the happy path, and for those with a validator a body the generated zod schema rejects, answered with a `ValidationError` body; `listRunners` shows only the runners of the token's instance, `restartRunner` refuses a runner of another instance with `NotFoundError` |

What the tests cannot cover is the behaviour of `docker/setup-buildx-action` and
`docker/build-push-action`, which ask the docker CLI several questions before they build.
Those answers were worked out against a real pipeline on a runner created by the
extension; the probe suite pins them (`docker buildx version`, a bare `docker buildx`,
`docker context inspect`).

Prism answers with the static examples of the upstream spec: every `createStack` returns
the same stack id and every stack reports the same example service. The domain matches
a service by name or by the id it stored, and treats a stack with a single service as
its own, so the lifecycle tests pass against the mock; a test with two different
targets cannot exist here.

`scripts/slim-openapi.ts` gives the project schema `supportedFeatures` an example of
`["container"]`, otherwise the mocked project would support no Container Hosting and
every create would stop at the capability check ([codegen.md](codegen.md)).

Prism rejects requests that contradict the upstream spec. The request bodies of the
extension are therefore checked against the real API contracts without the real APIs.

## Docker API adapter

`docker/docker-api` is a Go module with its own tests (`pnpm run docker-api:test`,
CI job `docker-api`). Unit tests cover the wrapper and the state files;
`internal/docker/cli_test.go` drives the `docker` CLI against the adapter with a fake
platform that runs every container as a local process. No daemon is involved, only
the CLI binary. Details and the live Testcontainers suite in
[docker-api.md](docker-api.md#development-and-tests).

## Emulated images on native hardware

The integration tests read an image built under qemu back from the registry. Whether it
runs on a real CPU of its architecture only that CPU can tell. `ci.yml` sets
`IMAGE_EXPORT_DIR` in both legs of `integration` and uploads the image of the other
architecture as the artifact `emulated-image-<X64|ARM64>`. The job `native-hardware` then
loads it on the other runner (arm64 image on `ubuntu-24.04-arm`, amd64 image on
`ubuntu-latest`) and checks `uname -m`, the `/machine` file written under qemu,
`file --version` from the package installed under qemu, and the cross-compiled Go binary
`/hello`. `uname -m` reports the machine the process runs as, so it only matches when the
image carries binaries of that architecture.

## Tests on the real platform

Everything above runs without credentials. What only the real platform can answer
(privileges, network, filesystem behavior of mittwald Container Hosting) lives in
[mstudio-ci-runner-extension-test](https://github.com/Hermsi1337/mstudio-ci-runner-extension-test):
workflows that run on a runner created through the extension and probe the
environment. They run manually against a runner registered in mStudio.

## New tests

- New upstream endpoint: add the path to `scripts/slim-openapi.ts`, run
  `pnpm run spec:update`, commit the result.
- New dependency: its own helper in `tests/helpers/`, never started inside the test file.
- Extend the table above.
