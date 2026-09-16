# Architecture

## Building blocks

| Block | Technology | Location |
|---|---|---|
| Frontend fragment inside mStudio | React 19, Flow remote React components, TanStack Router (CSR) | `src/routes/`, `src/components/` |
| Server functions | TanStack Start | `src/serverFunctions/` |
| Domain logic | TypeScript, `@mittwald/api-client` | `src/domain/runner.ts`, `src/domain/project.ts` |
| Changelog | GitHub releases via `@octokit/rest`, cached for ten minutes, cut at the running version | `src/domain/changelog.ts` |
| CI providers | `@octokit/rest`, generated GitLab client | `src/domain/providers/` ([providers.md](providers.md)) |
| Persistence | PostgreSQL, Drizzle ORM | `src/db/` |
| Lifecycle webhooks | `@weissaufschwarz/mitthooks` | `src/routes/api/webhooks.mittwald.ts` |
| Languages | Message catalogs, locale from browser or `x-locale` header | `src/i18n/` ([i18n.md](i18n.md)) |
| Runner containers | Ubuntu 24.04 + `actions/runner` or `gitlab-runner` | `docker/runner/<provider>/` |
| Logging | Own logger, level and format from the environment | `src/logger.ts` ([operations.md](operations.md#logging)) |

Stack and structure follow the [mittwald reference extension](https://github.com/mittwald/reference-extension).

## UI

`src/routes/index.tsx` stacks a brand header (`BrandHeader.tsx`, with the version
badge of the extension and the changelog button that opens `ChangelogModal.tsx`) and two cards:
`RunnersCard.tsx` with the runner list and the create modal, and `FeedbackCard.tsx`
with links to the repository. Rules for every
screen are in [styleguide.md](styleguide.md). The runners are grouped by registration target, one Flow `List` per group
(`RunnerList.tsx`), one `ListItemView` per runner with a context menu (`RunnerActions.tsx`) that opens the logs, settings and
confirmation modals through overlay controllers. Flow's list switches from columns to
stacked rows by container width, so no separate mobile layout exists.

Size presets (`small`, `medium`, `large`) and their limits live in
`src/runner-sizes.ts`, imported by the domain for the stack declaration and by the UI
for the summary. `custom` carries `cpus` and `memoryMb` in the request and the row.

Two Flow rules shape the components:

- A `Section` header collects every `ActionGroup` below it into its action slot. The
  create modal is therefore rendered next to the card and opened through a controller,
  not through a `ModalTrigger` inside the header.
- Inside a `ListItemView`, `Text` is tunneled into the subtitle. Column values are
  wrapped in `Content`, which starts a new props context level.

## Data flow "create runner"

1. The form inside mStudio calls `createRunnerServerFunction`. The middleware
   (`src/middleware/auth.ts`) verifies the session token, obtains an access token and
   builds the `MittwaldAPIV2Client` via `src/mittwald/client.ts`.
2. Input is validated with `zCreateRunnerRequest` (generated, see [codegen.md](codegen.md)),
   a discriminated union over `provider`.
3. `src/domain/project.ts` reads `supportedFeatures` of the project (`project.getProject`).
   Without the `container` feature the project cannot host containers and the create
   fails with `error.containerHosting.unavailable` before anything is created. The UI
   asks the same through `getProjectCapabilitiesServerFunction` and shows a hint instead
   of the create button.
4. The provider (`src/domain/providers/<provider>.ts`) checks access, creates the
   registration in the CI system where needed and returns image, environment and the
   data volume ([providers.md](providers.md)). Nothing secret is returned for storage.
5. `src/domain/stack.ts` finds the stack of the registration target in `runner_stacks`
   or creates it (`CI Runner: <target>` via `container.createStack`). The unique pair
   (extension instance, target URL) settles parallel creates: the loser deletes its
   duplicate stack and uses the winner's. If persisting the row fails, the extension
   deletes the stack it just created, so no orphaned stack stays behind. A create for
   an installation without an `extension_instance` row (webhook data missing) fails
   before anything is created.
6. `src/domain/runner.ts` adds the cache volume, environment and cronjob when
   requested ([providers.md](providers.md#package-manager-cache)) and declares the
   service `runner-<slug>` through `container.updateStack` (PATCH, so the other
   runners of the stack stay untouched) with `restartPolicy: always` and the resource
   limits of the size (preset from `src/runner-sizes.ts` or `cpus`/`memoryMb` for
   `custom`). Volumes carry the service name as prefix (`runner-<slug>-data`, `runner-<slug>-cache`).
7. A row in `runners` links extension instance, provider, stack and service. The API
   derives `studioUrl` from them, the detail page of the container in mStudio, linked
   from the runner name in the list.
8. The container registers itself on start ([runner-image.md](runner-image.md)).

Other operations: list with live status (`container.getStack`), logs
(`container.getServiceLogs`), restart (`container.restartService`), update to the
current image and settings changes (cache, concurrency, size), delete
(`container.deleteStack`, then `provider.release`). All stack operations run with the
access token of the signed-in user, so only with their permissions and the scopes of
the extension.

Update and settings changes redeclare the service through `container.updateStack`
and then call `container.recreateService`. A declaration alone only changes the
`pendingState` of the service; the container keeps running its `deployedState`
until it is recreated. The per-service action recreates only this runner, unlike
the `recreate` query parameter of `updateStack`, which would recreate every runner
that shares the stack. The extension skips the recreate only when mittwald reports
`requiresRecreate: false` for the declared service. A recreate cancels the job that
runs in the container; neither GitHub nor GitLab retries it automatically. The
runner row is written after the recreate succeeded, so a failed recreate leaves the
update on offer and the next attempt declares the same state again.

## Data model

Tables in `src/db/schema.ts`:

- `extension_instance`: managed by mitthooks (instance id, context, scopes, encrypted
  instance secret).
- `runners`: one row per runner. Foreign key to `extension_instance` with
  `ON DELETE CASCADE`. `stackId` and `serviceName` locate the container; `provider`,
  `target`, `targetUrl` describe the registration target. No column holds a provider
  secret: the registration token exists only in the environment of the runner container.
  `image` and `runnerVersion` record what the stack was declared with; `updateAvailable`
  in the API compares `image` with the image of the running extension release.
  Two versions exist and the UI keeps them apart: the extension version
  (`EXTENSION_VERSION`, `Changelog.currentVersion`, deployed by the maintainer, not
  updatable by users) and the image version of each runner (`Runner.imageVersion`,
  the tag of `image`). "Update" moves a runner's image to the extension version.
  The changelog therefore lists only releases up to the running extension version:
  a release that GitHub already shows but that is not deployed yet is nothing a
  user can get. Opened from the header, the modal marks the current release; opened
  from a runner, it names the runner's image version and the update target and
  shows the releases between them.
  `size`, `cpus`, `memoryMb`, `cache`, `cacheSizeGb` and `concurrency` hold the settings
  (`cpus` and `memoryMb` only for `size = custom`), `tokenType` records how the runner
  authenticated (decides the delete confirmation), `cronjobIds` lists the mittwald
  cronjobs created for the runner (cache cleanup).

One stack per registration target, one service per runner. Deleting removes the
service (`updateStack` with `{}`) and its volumes, then the stack when no runner row
points at it any more. Deleting the stack in mStudio removes every runner of that
target; the list shows them as `missing`.

## Lifecycle webhooks

`POST /api/webhooks/mittwald` receives all four events. mitthooks verifies the
signature and maintains `extension_instance`. A handler in front of the chain
(`cleanupRunnersOnRemoval`) reacts to `InstanceRemovedFromContext`: it reads the
runners of the instance, lets the default chain run and then deletes all stacks with a
token obtained from the instance secret (`extensionAuthenticateInstance`) plus the
registrations via `provider.release`. This happens detached because mStudio expects an
answer within 6 seconds.

## Security

- Session tokens are verified server side; access tokens never reach the client.
- GitHub: the registration token reaches the container as `RUNNER_TOKEN`, is worthless
  after one hour and is not stored in the database. The runner credentials live in the
  data volume of the runner. The PAT mode is disabled, see
  [providers.md](providers.md#existing-providers).
- GitLab: only the runner token from GitLab is involved. It reaches the container as
  `CI_SERVER_TOKEN` and is not stored in the database. Deleting the runner reads that
  token from the service state at mittwald; when the container is already gone, the
  runner stays in GitLab until someone removes it there. The PAT mode is disabled, see
  [providers.md](providers.md#existing-providers).
- The database holds one secret: the instance secret in `extension_instance`, encrypted
  with `ENCRYPTION_MASTER_PASSWORD` and `ENCRYPTION_SALT` (AES-256-GCM via
  mitthooks-drizzle). It authenticates the cleanup after an uninstall.
- Token requirements: [mstudio-setup.md](mstudio-setup.md#tokens).
- Errors reach the client only through `PublicError` subclasses (`src/global-errors.ts`);
  they carry message keys that the middleware renders in the request language.
- Runners run as the unprivileged user `runner` without a Docker socket.

### Trust model of a runner

A job is code from the repository, organization or GitLab group the runner is registered
for, executed inside the runner container. The container is the trust boundary, not the
job:

- `runner` has passwordless sudo (`runner ALL=(ALL) NOPASSWD:ALL`), because jobs install
  packages with `apt-get`. Every job can become root in the container.
- The data volume (work directory, tool cache, registration) and the cache volume
  survive between jobs. A job can leave files, or a modified tool, for the next one.
  There is no filesystem reset.
- Every job can read the environment of the runner process. The entrypoint unsets
  `RUNNER_TOKEN` (GitHub) and `CI_SERVER_TOKEN` (GitLab) before the runner starts;
  the GitLab `config.toml` is `chmod 600`. Secrets that a job needs come from the CI
  system, not from the container.
- The container reaches everything in the mittwald project network, such as
  databases and apps of that project. That is the point of the extension, and it means
  a job can reach them too.

What follows for operating runners:

- One runner (or one stack) per trust boundary. Do not register a runner for an
  organization whose repositories are maintained by people you would not give shell
  access to that project.
- Do not let untrusted pull requests run on the runner. GitHub: *Settings → Actions →
  General → Fork pull request workflows*, require approval for all outside collaborators.
  GitLab: protect the runner or restrict it to protected branches.
- Ephemeral runners (a fresh registration per job) are currently not available, see
  [providers.md](providers.md#existing-providers). Until they return, treat a runner as
  shared state between all jobs of its target.

## Bundle boundary

TanStack Start splits server and client code per server function. Modules that import
`src/db/` or `src/domain/` at module level end up in the client bundle and break the
build (`node:crypto`). UI code therefore imports types from `src/generated/` only.

The global function middleware in `src/start.ts` is the second way in: its module is
part of the client bundle, TanStack Start strips the `.server()` callback and Rollup
drops the logger with it, but only while nothing else in that module is exported.
v0.2.0 exported a helper from `src/middleware/error-handling.ts`, the logger followed
into the browser and `new AsyncLocalStorage()` threw at load, so mStudio showed
"Extension could not be loaded" although the server answered. Pure helpers therefore
live in `src/middleware/error-body.ts`, and `scripts/check-client-bundle.sh`
(`pnpm run check:bundle`, run by `ci.yml` after the build) greps the built assets for
markers of server-only modules.
