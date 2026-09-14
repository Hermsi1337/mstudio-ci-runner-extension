# Tests

## Setup

Vitest with two projects (`config/vitest.config.ts`):

| Project | Files | Command |
|---|---|---|
| `unit` | `src/**/*.test.ts`, `config/**/*.test.ts` (i18n catalog checks, logger, local host plugin rewrite) | `pnpm run test` |
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

`stoplight/prism:5` (latest) crashes on start (`isPrimary`), hence the pinned version.

`tests/helpers/env.ts` sets the extension environment. Defaults only fill missing
variables, overrides always win. Modules such as `src/db/schema.ts` read the environment
on import, so tests import them after the containers started via `await import(...)`.

## Test files

| File | Verifies |
|---|---|
| `database.test.ts` | Migrations, encrypted column `credentials`, cascade delete |
| `runner-lifecycle.test.ts` | Per provider case (GitHub repo, GitLab project, GitLab instance): `createRunner` → `listRunners` → logs/restart → `deleteRunner` against the Prism mocks; tenant isolation; input errors |
| `runner-image.test.ts` | Per image: builds with `RUNNER_VERSION` from `docker/runner/versions.json`, entrypoint reaches registration with the configured values, runs as user `runner` |

Prism rejects requests that contradict the upstream spec. The request bodies of the
extension are therefore checked against the real API contracts without the real APIs.

## New tests

- New upstream endpoint: add the path to `scripts/slim-openapi.ts`, run
  `pnpm run spec:update`, commit the result.
- New dependency: its own helper in `tests/helpers/`, never started inside the test file.
- Extend the table above.
