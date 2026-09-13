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

Stack and structure follow the [mittwald reference extension](https://github.com/mittwald/reference-extension).

## Data flow "create runner"

1. The form inside mStudio calls `createRunnerServerFunction`. The middleware
   (`src/middleware/auth.ts`) verifies the session token, obtains an access token and
   builds the `MittwaldAPIV2Client` via `src/mittwald/client.ts`.
2. Input is validated with `zCreateRunnerRequest` (generated, see [codegen.md](codegen.md)),
   a discriminated union over `provider`.
3. The provider (`src/domain/providers/<provider>.ts`) checks access, creates the
   registration in the CI system where needed and returns image, environment, volumes
   and the credentials to store ([providers.md](providers.md)).
4. `src/domain/runner.ts` creates a stack `CI Runner (<provider>): <name>` via
   `container.createStack` and declares the service `runner` via `container.declareStack`
   with `restartPolicy: always` and resource limits by size.
5. A row in `runners` links extension instance, provider, stack and service.
6. The container registers itself on start ([runner-image.md](runner-image.md)).

Other operations: list with live status (`container.getStack`), logs
(`container.getServiceLogs`), restart (`container.restartService`), delete
(`container.deleteStack`, then `provider.release`). All stack operations run with the
access token of the signed-in user, so only with their permissions and the scopes of
the extension.

## Data model

Tables in `src/db/schema.ts`:

- `extension_instance`: managed by mitthooks (instance id, context, scopes, encrypted
  instance secret).
- `runners`: one row per runner. Foreign key to `extension_instance` with
  `ON DELETE CASCADE`. `provider`, `target`, `targetUrl` describe the registration
  target. `credentials` is an encrypted column (`ENCRYPTION_MASTER_PASSWORD`,
  `ENCRYPTION_SALT`) holding provider-specific JSON, e.g. the GitLab runner token.

One stack per runner, no shared stack. Deleting is a single `deleteStack` without
touching other runners.

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
- GitHub: the PAT is stored encrypted and passed to the runner container as
  `GITHUB_TOKEN`. Project members with container access can read it there. Use
  fine-grained PATs with minimal scope.
- GitLab: the PAT is used once to create the runner and is not stored. The container
  only receives the runner token (`CI_SERVER_TOKEN`).
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
