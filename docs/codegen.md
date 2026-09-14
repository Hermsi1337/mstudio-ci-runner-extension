# Generated code

Principle: contracts live in specs, code is generated from them. Hand-written code is
limited to domain logic and UI. Generated files are never edited by hand.

| Source | Generator | Output | Command |
|---|---|---|---|
| mittwald OpenAPI | `@mittwald/api-client` (maintained by mittwald) | Typed client, e.g. `mittwaldClient.container.declareStack` | `pnpm up @mittwald/api-client` |
| GitHub OpenAPI | `@octokit/rest` (maintained by GitHub) | Typed client for `actions.listSelfHostedRunnersFor*` | `pnpm up @octokit/rest` |
| `openapi/extension-api.yaml` | `@hey-api/openapi-ts`, config `config/openapi-ts.config.ts` | `src/generated/extension-api/{types.gen.ts,zod.gen.ts,index.ts}` | `pnpm run codegen` |
| `openapi/upstream/gitlab.json` | `@hey-api/openapi-ts` (typescript, client-fetch, sdk), same config | `src/generated/gitlab/`: typed GitLab client | `pnpm run codegen` |
| `src/db/schema.ts` | `drizzle-kit generate`, config `config/drizzle.config.ts` | SQL migrations in `src/db/migrations/` | `pnpm run db:generate-migrations` |
| `src/routes/**` | TanStack Router Vite plugin | `src/routeTree.gen.ts` | automatically on `dev`/`build` |
| mittwald, GitHub, GitLab OpenAPI | `scripts/slim-openapi.ts` | `openapi/upstream/{mittwald-v2,github,gitlab}.json` | `pnpm run spec:update` |

## Extension API (`openapi/extension-api.yaml`)

The contract between UI and server functions. Contains only `components.schemas`, no
paths, because TanStack server functions have no HTTP routing in the OpenAPI sense.

- `CreateRunnerRequest`: discriminated union over `provider` of `GitHubRunnerRequest`
  and `GitLabRunnerRequest` (both allOf `RunnerBase`). The `discriminator.mapping` is
  mandatory, otherwise hey-api emits schema names as literals.
- `RunnerIdRequest`, `RunnerLogsRequest`: further inputs. Server functions use the
  generated zod schemas (`zCreateRunnerRequest`, ...) as `inputValidator`.
- `Runner`, `RunnerList`: outputs. Server functions check their return value with
  `zRunner.parse` / `zRunnerList.parse`.
- `RunnerSize`, `RunnerStatus`, `Provider`, `GitLabRunnerType`: enums, available in the UI
  as types and constants.

Workflow for changes:

1. Edit the spec.
2. `pnpm run codegen`.
3. Adjust domain logic in `src/domain/` and the UI; `pnpm run typecheck` shows the spots.
4. Commit the generated code. CI checks `git diff --exit-code -- src/generated`.

## Upstream subsets (`openapi/upstream/`)

`scripts/slim-openapi.ts` downloads the upstream documents (OpenAPI 3 and Swagger 2),
keeps only the paths the extension uses, resolves referenced definitions transitively
and removes `security`. The results serve two purposes: input for client generation
(GitLab) and Prism mocks in the integration tests ([testing.md](testing.md)). Maintain
the path list in the script when new endpoints are used, then run
`pnpm run spec:update` and commit the result.

Upstream bugs are corrected in the script via `patch` and commented there. Currently:
GitLab marks `group_id`/`project_id` on `POST /user/runners` as required although they
depend on `runner_type`.
