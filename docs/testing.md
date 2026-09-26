# Tests

## Setup

Vitest with two projects (`config/vitest.config.ts`):

| Project | Files | Command |
|---|---|---|
| `unit` | `src/**/*.test.ts`, `config/**/*.test.ts` (i18n catalog checks, logger, version compare, error mapping) | `pnpm run test` |
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
| `tests/integration/runner-image.test.ts` | builds `docker/runner/<provider>/` | Images `mstudio-ci-runner-<provider>:test` |
| `tests/integration/image-build.test.ts` | builds `docker/builder/` and the GitHub runner, plus two `registry:2` (one open, one with an htpasswd login) | Image builds end to end: runner, builder and a registry on one network, the queue directory as a bind mount |

The probe suite in `docker/runner/probes/` runs inside the built images.
`probe.sh` provides `expect` and `expect_output`, `common.sh` holds the checks every
image passes (user `runner`, sudo, `apt-get install`, toolchain, writable paths,
symlinks, exec bit, `trim-cache.sh`, the image build tools and the rejections of the
docker shim), `<provider>.sh` adds the runner binary and
asserts its version against `docker/runner/versions.json`
(`EXPECTED_RUNNER_VERSION`). All of it runs without credentials, so it works on
every pull request, forks included.

`stoplight/prism:5` (latest) crashes on start (`isPrimary`), hence the pinned version.
The image exists for amd64 only. On an arm64 host it runs under QEMU emulation: Docker
Desktop ships it, CI installs it with `docker/setup-qemu-action` in the arm64 leg of
`integration`.

Ubuntu 24.04 sets `kernel.apparmor_restrict_unprivileged_userns=1`, which takes the
capabilities away from an unconfined process in a user namespace it created. The
emulated builds of the builder need them, so `ci.yml` sets the sysctl to `0` before the
integration tests. A local Ubuntu 24.04 host needs the same, or the emulation tests fail
with `EMULATION` other than `namespace`.

`tests/helpers/env.ts` sets the extension environment. Defaults only fill missing
variables, overrides always win. Modules such as `src/db/schema.ts` read the environment
on import, so tests import them after the containers started via `await import(...)`.

## Test files

| File | Verifies |
|---|---|
| `database.test.ts` | Migrations, encrypted instance secret, no secret column in `runners`, cascade delete |
| `runner-lifecycle.test.ts` | Per provider case (GitHub repo, three GitLab runner token variants): `createRunner` → `listRunners` → logs/restart → update (declare and recreate) → settings → `deleteRunner` against the mittwald and GitLab Prism mocks; image builds on and off; two runners sharing a stack; a runner in a stack the user picked (no `runner_stacks` row, stack survives the delete, stacks of another project and stacks the extension manages are rejected, service names are checked against the stack); tenant isolation; input errors |
| `runner-image.test.ts` | Per image: builds with `RUNNER_VERSION` and the `RUNNER_SHA256_*` checksums from `docker/runner/versions.json`, entrypoint reaches registration with the configured values, runs as user `runner`, passes the probe suite, entrypoint rejects missing required variables with a clear message |
| `image-build.test.ts` | `docker build --push` from the runner through the builder into a registry, image id and metadata file match the pushed digest, a failing build keeps its exit code, the predefined platform arguments (`TARGETARCH` and friends) are set in a native build, `apt-get install procps` on a Debian base image passes (Alpine files like `/etc/sysctl.conf` must not collide with conffiles), a base image with file capabilities builds with a warning, BuildKit only features and an architecture without emulator in `FROM` are refused before a job is queued. For the other architecture (arm64 on an amd64 host, amd64 on an arm64 host): a `COPY`-only image and a cross-compiled Go binary without emulation, checked by the architecture in the image config and the ELF machine of the binary; the explanation of `exec format error` when the builder found no emulation; `RUN` under qemu in the sandbox; a base image with file capabilities in the sandbox; `docker buildx build --platform linux/amd64,linux/arm64 --push` into the registry with a login, which has to end up as one index under the only tag, with the index digest in `--iidfile` and `--metadata-file` ([image-builds.md](image-builds.md)). Every test starts its own builder, because kaniko destroys the container it builds in. Builds for several platforms need one builder per job, `superviseBuilders` starts the next one when the last one exited. The builder gets the capabilities of a Container Hosting container (no `SETFCAP`, `MKNOD`, `NET_RAW`, `SYS_CHROOT`, `AUDIT_WRITE`) and, like there, no seccomp filter and no AppArmor profile (`seccomp=unconfined`, `apparmor=unconfined`). Docker's default seccomp profile blocks `unshare`, only the fallback test keeps it |
| `changelog.test.ts` | `getChangelog` against the GitHub Prism mock: releases parsed and validated, second call served from the cache, releases newer than `EXTENSION_VERSION` hidden |

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
