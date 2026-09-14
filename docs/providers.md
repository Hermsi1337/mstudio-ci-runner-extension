# CI providers

The extension is provider-neutral. A provider encapsulates everything a CI system
needs so the container can register itself. Everything else (stack, status, logs,
deletion) is shared.

## Interface

`src/domain/providers/types.ts`:

| Method | Responsibility |
|---|---|
| `runnerVersion` | Version of the runner software in the image, read from `docker/runner/versions.json` |
| `currentImage()` | Image this extension release creates runners with (`RUNNER_IMAGE_<PROVIDER>`) |
| `prepare(input, runnerName)` | Check access, create the provider-side registration, return image, runner version, environment variables, volumes and the credentials to store |
| `release(credentials)` | Remove the provider-side registration; must tolerate runners that are already gone |

`updateRunner` in `src/domain/runner.ts` redeclares the stack with `currentImage()` and
the service state mittwald reports, so providers need no update hook. GitHub runners
keep their registration in the `config` volume, GitLab runners keep their runner token.

Registry in `src/domain/providers/index.ts`. `src/domain/runner.ts` picks the provider
from `input.provider` and knows no provider details beyond that.

## Existing providers

| Provider | Inputs | Registration | Credentials in the container | Cleanup |
|---|---|---|---|---|
| `github` | `target` (owner or owner/repo), `tokenType` (`registration`, default, or `pat`), `token`, `runnerGroup`, `ephemeral` (PAT only) | `registration`: no API call, the container registers with the token from the "New self-hosted runner" page and keeps the registration in the `config` volume. `pat`: access verified via `GET .../actions/runners` (Octokit); the container fetches a registration token with the PAT on start | `registration`: the registration token (`RUNNER_TOKEN`), useless after one hour. `pat`: the PAT (`GITHUB_TOKEN`) | The container deregisters itself on SIGTERM. With an expired registration token the runner stays offline in GitHub until GitHub removes it after 14 days |
| `gitlab` | `instanceUrl`, `runnerType` (project/group/instance), `target` (path), `token` (PAT), `runUntagged` | `POST /api/v4/user/runners` with the PAT returns a runner token `glrt-...` | Runner token only (`CI_SERVER_TOKEN`), never the PAT | `DELETE /api/v4/runners?token=` |

GitLab client: generated from `openapi/upstream/gitlab.json` ([codegen.md](codegen.md)).
Project and group ids are resolved via `GET /projects/{path}` and `GET /groups/{path}`.

Token requirements: [mstudio-setup.md](mstudio-setup.md#tokens).

## Adding a provider

1. `openapi/extension-api.yaml`: value in `Provider`, new `<Name>RunnerRequest`
   (allOf `RunnerBase`), entry in `CreateRunnerRequest.oneOf` and
   `discriminator.mapping`. Run `pnpm run codegen`.
2. If the provider needs an API: add its paths to `scripts/slim-openapi.ts`, run
   `pnpm run spec:update`, add a job to `config/openapi-ts.config.ts`, run `pnpm run codegen`.
3. `src/domain/providers/<name>.ts` implementing `RunnerProvider<ProviderRequest<"<name>">>`,
   registered in `index.ts`.
4. `RUNNER_IMAGE_<NAME>` in `src/env.ts`, `tests/helpers/env.ts`; runner version in
   `docker/runner/versions.json`.
5. Image under `docker/runner/<name>/` ([runner-image.md](runner-image.md)), matrix entry
   in `.github/workflows/runner-image.yml`.
6. Form fields in `src/components/runners/RunnerForm.tsx`, label in `RunnerTable.tsx`.
7. Test case in `tests/integration/runner-lifecycle.test.ts` (Prism mock) and
   `runner-image.test.ts`.
8. This file, [runner-image.md](runner-image.md), [mstudio-setup.md](mstudio-setup.md).

Candidates: Gitea/Forgejo (`act_runner`), Azure DevOps agent, Bitbucket runner.
