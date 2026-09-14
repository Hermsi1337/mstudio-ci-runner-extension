# Architecture

## Building blocks

| Block | Technology | Location |
|---|---|---|
| Frontend fragment inside mStudio | React 19, Flow remote React components, TanStack Router (CSR) | `src/routes/`, `src/components/` |
| Server functions | TanStack Start | `src/serverFunctions/` |
| Domain logic | TypeScript, `@mittwald/api-client` | `src/domain/runner.ts` |
| CI providers | `@octokit/rest`, generated GitLab client | `src/domain/providers/` ([providers.md](providers.md)) |
| Persistence | PostgreSQL, Drizzle ORM | `src/db/` |
| Lifecycle webhooks | `@weissaufschwarz/mitthooks` | `src/routes/api/webhooks.mittwald.ts` |
| Languages | Message catalogs, locale from browser or `x-locale` header | `src/i18n/` ([i18n.md](i18n.md)) |
| Runner containers | Ubuntu 24.04 + `actions/runner` or `gitlab-runner` | `docker/runner/<provider>/` |
| Logging | Own logger, level and format from the environment | `src/logger.ts` ([operations.md](operations.md#logging)) |

Stack and structure follow the [mittwald reference extension](https://github.com/mittwald/reference-extension).

## UI

`src/routes/index.tsx` stacks two cards: `RunnersCard.tsx` with the runner list and the
create modal, and `FeedbackCard.tsx` with links to the repository. Rules for every
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
3. The provider (`src/domain/providers/<provider>.ts`) checks access, creates the
   registration in the CI system where needed and returns image, environment, the
   `runner-data` volume and the credentials to store ([providers.md](providers.md)).
4. `src/domain/stack.ts` finds the stack of the registration target in `runner_stacks`
   or creates it (`CI Runner: <target>` via `container.createStack`). The unique pair
   (extension instance, target URL) settles parallel creates: the loser deletes its
   duplicate stack and uses the winner's.
5. `src/domain/runner.ts` adds the cache volume, environment and cronjob when
   requested ([providers.md](providers.md#package-manager-cache)) and declares the
   service `runner-<slug>` through `container.updateStack` (PATCH, so the other
   runners of the stack stay untouched) with `restartPolicy: always` and the resource
   limits of the size (preset from `src/runner-sizes.ts` or `cpus`/`memoryMb` for
   `custom`). Volumes carry the service name as prefix (`runner-<slug>-runner-data`).
6. A row in `runners` links extension instance, provider, stack and service. The API
   derives `studioUrl` from them, the detail page of the container in mStudio, linked
   from the runner name in the list.
7. The container registers itself on start ([runner-image.md](runner-image.md)).

Other operations: list with live status (`container.getStack`), logs
(`container.getServiceLogs`), restart (`container.restartService`), update to the
current image and cache settings (both `container.declareStack`), delete
(`container.deleteStack`, then `provider.release`). All stack operations run with the
access token of the signed-in user, so only with their permissions and the scopes of
the extension.

## Data model

Tables in `src/db/schema.ts`:

- `extension_instance`: managed by mitthooks (instance id, context, scopes, encrypted
  instance secret).
- `runners`: one row per runner. Foreign key to `extension_instance` with
  `ON DELETE CASCADE`. `stackId` and `serviceName` locate the container; `provider`,
  `target`, `targetUrl` describe the registration target. `credentials` is an encrypted column (`ENCRYPTION_MASTER_PASSWORD`,
  `ENCRYPTION_SALT`) holding provider-specific JSON, e.g. the GitLab runner token.
  `image` and `runnerVersion` record what the stack was declared with; `updateAvailable`
  in the API compares `image` with the image of the running extension release.
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
- GitHub with a registration token (default): the token reaches the container as
  `RUNNER_TOKEN`, is worthless after one hour and is not stored in the database. The
  runner credentials live in the `runner-data` volume of the stack.
- GitHub with a PAT: the PAT is stored encrypted and passed to the runner container as
  `GITHUB_TOKEN`. Project members with container access can read it there. Use
  fine-grained PATs with minimal scope.
- GitLab: with a runner token from GitLab nothing else is involved. With a PAT it is
  used once to create the runner and is not stored. In both modes the container only
  receives the runner token (`CI_SERVER_TOKEN`), which is also stored encrypted for
  deleting the runner.
- Token requirements: [mstudio-setup.md](mstudio-setup.md#tokens).
- Errors reach the client only through `PublicError` subclasses (`src/global-errors.ts`);
  they carry message keys that the middleware renders in the request language.
- Runners run as the unprivileged user `runner` without a Docker socket.

## Local mode

`/local` renders the UI without an mStudio host for development
([development.md](development.md#local-mode-without-mstudio)). The auth middleware
accepts `x-local-mode: 1` only when `LOCAL_API_TOKEN` and `LOCAL_PROJECT_ID` are set
and `NODE_ENV` is not `production`; the request context then carries the personal API
token and the project id as extension instance id.

## Bundle boundary

TanStack Start splits server and client code per server function. Modules that import
`src/db/` or `src/domain/` at module level end up in the client bundle and break the
build (`node:crypto`). UI code therefore imports types from `src/generated/` only.
