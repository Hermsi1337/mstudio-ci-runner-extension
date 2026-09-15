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

The probe suite in `docker/runner/probes/` runs inside the built images.
`probe.sh` provides `expect` and `expect_output`, `common.sh` holds the checks every
image passes (user `runner`, sudo, `apt-get install`, toolchain, writable paths,
symlinks, exec bit, `trim-cache.sh`), `<provider>.sh` adds the runner binary and
asserts its version against `docker/runner/versions.json`
(`EXPECTED_RUNNER_VERSION`). All of it runs without credentials, so it works on
every pull request, forks included.

`stoplight/prism:5` (latest) crashes on start (`isPrimary`), hence the pinned version.

`tests/helpers/env.ts` sets the extension environment. Defaults only fill missing
variables, overrides always win. Modules such as `src/db/schema.ts` read the environment
on import, so tests import them after the containers started via `await import(...)`.

## Test files

| File | Verifies |
|---|---|
| `database.test.ts` | Migrations, encrypted column `credentials`, cascade delete |
| `runner-lifecycle.test.ts` | Per provider case (GitHub repo, GitLab project, GitLab instance): `createRunner` → `listRunners` → logs/restart → settings → `deleteRunner` against the Prism mocks; two runners sharing a stack; tenant isolation; input errors |
| `runner-image.test.ts` | Per image: builds with `RUNNER_VERSION` from `docker/runner/versions.json`, entrypoint reaches registration with the configured values, runs as user `runner`, passes the probe suite, entrypoint rejects missing required variables with a clear message |
| `changelog.test.ts` | `getChangelog` against the GitHub Prism mock: releases parsed and validated, second call served from the cache |

Prism answers with the static examples of the upstream spec: every `createStack` returns
the same stack id and every stack reports the same example service. The domain matches
a service by name or by the id it stored, and treats a stack with a single service as
its own, so the lifecycle tests pass against the mock; a test with two different
targets cannot exist here.

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
