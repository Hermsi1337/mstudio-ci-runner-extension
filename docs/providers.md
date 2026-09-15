# CI providers

The extension is provider-neutral. A provider encapsulates everything a CI system
needs so the container can register itself. Everything else (stack, status, logs,
deletion) is shared.

## Interface

`src/domain/providers/types.ts`:

| Method | Responsibility |
|---|---|
| `runnerVersion` | Version of the runner software in the image, read from `docker/runner/versions.json` (`<provider>.version`) |
| `currentImage()` | Image this extension release creates runners with (`RUNNER_IMAGE_<PROVIDER>`) |
| `concurrencyVariable` | Optional. Environment variable for the number of jobs the runner takes at once (`RUNNER_CONCURRENT` for GitLab). Without it the runner takes one job at a time and `concurrency` is stored as 1 |
| `prepare(input, runnerName)` | Check access, create the provider-side registration, return image, runner version, environment variables, volumes, the labels to show and the credentials to store |
| `release(credentials)` | Remove the provider-side registration; must tolerate runners that are already gone |

Every provider returns `DATA_VOLUME_MOUNT` (`data:/home/runner/data`) as its only
volume; the images keep all persistent state below that directory
([runner-image.md](runner-image.md#volumes)). The domain prefixes volume names with
the service name before declaring them (`runner-<slug>-data`), so runners sharing a
stack keep separate volumes.

`updateRunner` in `src/domain/runner.ts` redeclares the service with `currentImage()` and
the service state mittwald reports, so providers need no update hook. GitHub runners
keep their registration in the data volume, GitLab runners keep their runner token.

## Package manager cache

The cache is provider-neutral and lives in `src/domain/cache.ts`, providers never touch
it. `cache: true` adds the volume `cache:/home/runner/.cache` (declared as
`runner-<slug>-cache`) and the environment
`XDG_CACHE_HOME` plus the variables of npm, pnpm, yarn, pip, Composer and Go. The runner
process inherits the variables into every job, so no provider cache feature is
involved. `runner.ts` then creates a mittwald service cronjob (stack, service, command)
from `cacheTrimCronjob(sizeGb)` that runs `/usr/local/bin/trim-cache.sh` hourly inside
the container, stores its id in `runners.cronjobIds` and deletes it with the runner.

`configureRunner` changes cache, concurrency and resources after creation
(`ConfigureRunnerRequest`: `cache`, `cacheSizeGb`, `concurrency`, `size`, `cpus`,
`memoryMb`). `withCache` and `withoutCache` add or strip the cache mount and
variables from the service state mittwald reports, the stack is redeclared and mittwald
recreates the container. Turning the cache on creates the cronjob, changing the limit
patches its command, turning it off deletes the cronjob and the volume
(`container.listStackVolumes`, `container.deleteVolume`). A volume that is still in use
(412) stays orphaned in the stack and can be removed in mStudio. `runners.cache`,
`runners.cacheSizeGb` and `runners.concurrency` record the current settings.

Registry in `src/domain/providers/index.ts`. `src/domain/runner.ts` picks the provider
from `input.provider` and knows no provider details beyond that.

## Existing providers

| Provider | Inputs | Registration | Credentials in the container | Cleanup |
|---|---|---|---|---|
| `github` | `target` (owner or owner/repo), `tokenType` (`registration`, default, or `pat`), `token`, `runnerGroup`, `ephemeral` (PAT only) | `registration`: no API call, the container registers with the token from the "New self-hosted runner" page and keeps the registration in the `config` volume. `pat`: access verified via `GET .../actions/runners` (Octokit); the container fetches a registration token with the PAT on start | `registration`: the registration token (`RUNNER_TOKEN`), useless after one hour. `pat`: the PAT (`GITHUB_TOKEN`) | The container deregisters itself on SIGTERM. With an expired registration token the runner stays offline in GitHub until GitHub removes it after 14 days |
| `gitlab` | `instanceUrl`, `tokenType` (`registration`, default, or `pat`), `token`, and with `pat`: `runnerType` (project/group/instance), `target` (path), `runUntagged` | `registration`: the runner token `glrt-...` from the "New runner" page is checked with `POST /api/v4/runners/verify`; scope and tags live in GitLab, `labels` is stored empty. `pat`: `POST /api/v4/user/runners` with the PAT creates the runner and returns its token | Runner token only (`CI_SERVER_TOKEN`), never the PAT | `DELETE /api/v4/runners?token=` in both modes |

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
4. `RUNNER_IMAGE_<NAME>` in `src/env.ts`, `tests/helpers/env.ts`; runner version and
   binary checksums in `docker/runner/versions.json`.
5. Image under `docker/runner/<name>/` ([runner-image.md](runner-image.md)), matrix entry
   in `.github/workflows/runner-image.yml`.
6. Form fields in `src/components/runners/RunnerForm.tsx`, initials and filter value in
   `RunnerList.tsx`, `provider.<name>` in both catalogs under `src/i18n/`.
   A provider that shows a setup command on its "new runner" page gets a pattern in
   `parseConfigCommand.ts`.
7. Test case in `tests/integration/runner-lifecycle.test.ts` (Prism mock) and
   `runner-image.test.ts`.
8. This file, [runner-image.md](runner-image.md), [mstudio-setup.md](mstudio-setup.md).

Candidates: Gitea/Forgejo (`act_runner`), Azure DevOps agent, Bitbucket runner.
