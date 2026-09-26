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
| `concurrencyVariable` | Optional. Environment variable for the number of jobs the runner takes at once (`RUNNER_CONCURRENT` for GitLab, `RUNNER_CAPACITY` for Forgejo). Without it the runner takes one job at a time and `concurrency` is stored as 1 |
| `prepare(input, runnerName)` | Check access, create the provider-side registration, return image, runner version, environment variables, volumes and the labels to show |
| `release(environment)` | Remove the provider-side registration with the environment of the runner container as mittwald reports it (the extension stores no provider secrets); must tolerate runners that are already gone |

Every provider returns `DATA_VOLUME_MOUNT` (`data:/home/runner/data`) as its only
volume; the images keep all persistent state below that directory
([runner-image.md](runner-image.md#volumes)). The domain prefixes volume names with
the service name before declaring them (`runner-<slug>-data`), so runners sharing a
stack keep separate volumes.

`updateRunner` in `src/domain/runner.ts` redeclares the service with `currentImage()` and
the service state mittwald reports, so providers need no update hook. GitHub runners
keep their registration in the data volume, GitLab and Forgejo runners keep their runner
token in the container environment.

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
variables from the service state mittwald reports, the stack is redeclared and the
service recreated (`container.recreateService`, see
[architecture.md](architecture.md#data-flow-create-runner)). Turning the cache on creates the cronjob, changing the limit
patches its command, turning it off deletes the cronjob and the volume
(`container.listStackVolumes`, `container.deleteVolume`). A volume that is still in use
(412) stays orphaned in the stack and can be removed in mStudio. `runners.cache`,
`runners.cacheSizeGb` and `runners.concurrency` record the current settings.

Registry in `src/domain/providers/index.ts`. `src/domain/runner.ts` picks the provider
from `input.provider` and knows no provider details beyond that.

## Existing providers

| Provider | Inputs | Registration | Credentials in the container | Cleanup |
|---|---|---|---|---|
| `github` | `target` (owner or owner/repo), `token` (registration token), `runnerGroup` | No API call. The container registers with the token from the "New self-hosted runner" page and keeps the registration in the `config` directory of its data volume | The registration token (`RUNNER_TOKEN`), useless after one hour and unset before the runner starts | None. The runner stays offline in GitHub until GitHub removes it after 14 days |
| `gitlab` | `instanceUrl` and `token`, both read from the `gitlab-runner register` command | The runner token `glrt-...` from the "New runner" page is checked with `POST /api/v4/runners/verify`. Scope and tags live in GitLab, `labels` is stored empty | Runner token only (`CI_SERVER_TOKEN`) | `DELETE /api/v4/runners?token=` with the token from the service environment. Without a container (deleted in mStudio) the runner stays in GitLab |
| `forgejo` | `instanceUrl`, `uuid` and `token` as three fields, plus `labels` | None and no API call. `prepare` only checks that `instanceUrl` is an https URL without credentials, query or fragment, and that no label contains `:` or `?`. The container presents UUID and token on every start through `server.connections` | UUID and runner token (`FORGEJO_RUNNER_UUID`, `FORGEJO_RUNNER_TOKEN`), durable like the GitLab token | None. The runner stays offline in Forgejo until someone deletes it there |

### Forgejo

Forgejo (verified against 15.0.1) creates a runner under `Settings` → `Actions` →
`Runners` of a repository, organization, user or the site administration and shows a
UUID and a token once. Where it is created decides which repositories may use it; the
extension does not need to know. An instance that hands out a registration token
instead of a UUID cannot be used. The form has three plain fields and
`parseConfigCommand.ts` has no Forgejo pattern, because Forgejo shows no command.

- **No verification.** Checking the credentials means connecting as the runner, which the
  container does seconds later. An anonymous `GET /api/v1/version` would say nothing about
  them and returns 403 on instances that require sign-in. Forgejo needs no generated
  client.
- **No cleanup.** Deleting a runner in Forgejo needs a user or admin token, which would
  have to live in the runner container. `release` is a no-op and the delete dialog says
  the runner stays offline in Forgejo.
- **Labels.** Stored and shown like GitHub labels. The image registers each one as
  `<label>:host` ([runner-image.md](runner-image.md#forgejo-dockerrunnerforgejo)).
  `prepare` rejects labels with `:` or `?` (`error.forgejo.labelsInvalid` on the field
  `labels`): a colon would pick another executor that the UI would still show, a question
  mark starts label options and stops the runner from starting.
- **Token.** `forgejo-runner` accepts letters and digits only, so the spec has
  `pattern: '^[A-Za-z0-9]+$'` on `token` and `format: uuid` on `uuid`. A token pasted with
  a space or a trailing period fails validation instead of crash-looping the container.
- **Stack.** One per instance URL, like GitLab.

GitLab client: generated from `openapi/upstream/gitlab.json` ([codegen.md](codegen.md)).
It covers two endpoints, `POST /api/v4/runners/verify` and `DELETE /api/v4/runners`.

Token requirements: [mstudio-setup.md](mstudio-setup.md#tokens).

GitHub and GitLab had a PAT mode. They are disabled: for GitHub the PAT lived in the runner
container where every job could read it, for GitLab it bought nothing over pasting the
register command. Runners created in the GitHub PAT mode keep `tokenType: pat` and
`ephemeral: true` in their row and keep running. The way back for GitHub is server-side
minting of registration tokens, tracked in
[issue #25](https://github.com/Hermsi1337/mstudio-ci-runner-extension/issues/25).

## Adding a provider

1. `openapi/extension-api.yaml`: value in `Provider`, new `<Name>RunnerRequest`
   (allOf `RunnerBase`), entry in `CreateRunnerRequest.oneOf` and
   `discriminator.mapping`. Run `pnpm run codegen`.
2. If the provider needs an API: add its paths to `scripts/slim-openapi.ts`, run
   `pnpm run spec:update`, add a job to `config/openapi-ts.config.ts`, run `pnpm run codegen`.
3. `src/domain/providers/<name>.ts` implementing `RunnerProvider<ProviderRequest<"<name>">>`,
   registered in `index.ts`.
4. `RUNNER_IMAGE_<NAME>` in `src/env.ts`, `tests/helpers/env.ts`, `.env.example`; runner
   version and binary checksums in `docker/runner/versions.json`.
5. Image under `docker/runner/<name>/` ([runner-image.md](runner-image.md)), probes in
   `docker/runner/probes/<name>.sh`, matrix entry in `.github/workflows/runner-image.yml`,
   provider list in `scripts/build-runner-images.sh`, image row in the release notes of
   `.github/workflows/release.yml`, directory in `.github/dependabot.yml`.
6. Form fields in `src/components/runners/RunnerForm.tsx`, initials and filter value in
   `RunnerList.tsx`, logo in `provider-logos.ts`, entry in `CreateRunnerModal.tsx`,
   `concurrentProviders` in `ConcurrencyField.tsx` when it sets `concurrencyVariable`,
   `provider.<name>` and the per-provider keys (`form.provider.<name>.text`,
   `runners.delete.text.<name>`, `form.summary.dataVolume.text.<name>`,
   `form.snippet.text.<name>`) in both catalogs under `src/i18n/`.
   A provider that shows a setup command on its "new runner" page gets a pattern in
   `parseConfigCommand.ts`.
7. Test case in `tests/integration/runner-lifecycle.test.ts` (Prism mock) and
   `runner-image.test.ts`.
8. This file, [runner-image.md](runner-image.md), [mstudio-setup.md](mstudio-setup.md).

Candidates: Gitea (`act_runner`, close to `forgejo-runner` but with other label
conventions and settings pages), Azure DevOps agent, Bitbucket runner.
