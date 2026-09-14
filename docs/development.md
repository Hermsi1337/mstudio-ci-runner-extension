# Local development

## Prerequisites

- Node 24 (runs `scripts/*.ts` directly), pnpm via `corepack enable`
- Docker (database, tests, runner images)
- Optional: [zrok](https://zrok.io) for webhooks

## Start

```bash
corepack enable
pnpm install
cp .env.example .env            # fill in values
pnpm run init:encryption        # fills ENCRYPTION_MASTER_PASSWORD and ENCRYPTION_SALT
pnpm run dev:all                # PostgreSQL plus dev server, Ctrl+C stops both
pnpm run dev:expose             # zrok tunnel (ZROK_SHARE_NAME in .env), separate terminal
```

Separately: `pnpm run db:start` (PostgreSQL on port 5433, `scripts/dev-db.sh`) and
`pnpm run dev` (extension on http://localhost:3000).

Both print the application log to the terminal. `LOG_LEVEL=debug` in `.env` shows
every authenticated request, provider lookups and stack calls
([operations.md](operations.md#logging)).

Chromium-based browsers block the mStudio WebSocket connection to `localhost`.
Firefox works.

## Local mode without mStudio

`http://localhost:3000/local` shows the same UI outside mStudio and authenticates with
a personal API token instead of a session token. Set in `.env`:

```bash
LOCAL_API_TOKEN=...     # mStudio, User → API tokens, with access to the project
LOCAL_PROJECT_ID=...    # the project that receives the runner stacks
```

`EXTENSION_ID` and `EXTENSION_SECRET` may keep placeholder values in this mode. Local
mode is refused when `NODE_ENV=production` and when either variable is missing.

How it works: the `/local` route (`src/routes/local.tsx`) enables a flag in
`src/local-mode.ts`, the client middleware then sends `x-local-mode: 1` instead of
`x-session-token`, and the server middleware (`src/middleware/local-mode.ts`) builds
the request context from the two variables. The extension instance row uses the
project id as its id. The UI components are written against the remote Flow
components, which only render inside mStudio; the Vite plugin in
`config/local-host-plugin.ts` serves a second copy of `src/components/` and
`src/hooks/` (plus modules they import relatively) under the `local:` import prefix
with the DOM-rendering `@mittwald/flow-react-components` swapped in.

Modules served under the `local:` prefix are not watched: after a change in
`src/components/` or `src/hooks/`, restart `pnpm run dev`.

Not covered by local mode: session token handling, lifecycle webhooks, mStudio
anchors. Real stacks are created in the project, delete them via the UI afterwards.

## Environment variables

Defined and validated in `src/env.ts`, template in `.env.example`.

| Variable | Meaning |
|---|---|
| `PORT` | HTTP port, default `3000` |
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `POSTGRES_HOST`, `POSTGRES_PORT`, `POSTGRES_USE_SSL` | Database |
| `EXTENSION_ID`, `EXTENSION_SECRET` | From mStudio ([mstudio-setup.md](mstudio-setup.md)) |
| `ENCRYPTION_MASTER_PASSWORD`, `ENCRYPTION_SALT` | Key for encrypted columns |
| `RUN_MIGRATIONS_ON_STARTUP` | Default `true` |
| `LOG_LEVEL` | `debug`, `info` (default), `warn`, `error` ([operations.md](operations.md#logging)) |
| `LOG_FORMAT` | `text` (default) or `json` (default when `NODE_ENV=production`); text output is colored unless `NO_COLOR` is set |
| `EXTENSION_VERSION` | Release of the extension, default the version in `package.json`; set by the image build |
| `RUNNER_IMAGE_GITHUB` | Image for GitHub runners, default `ghcr.io/hermsi1337/mstudio-ci-runner-github:<EXTENSION_VERSION>` |
| `RUNNER_IMAGE_GITLAB` | Image for GitLab runners, default `ghcr.io/hermsi1337/mstudio-ci-runner-gitlab:<EXTENSION_VERSION>` |
| `MITTWALD_API_URL` | Default `https://api.mittwald.de/`; the Prism mock in tests |
| `GITHUB_API_URL` | Default `https://api.github.com`; the Prism mock in tests; also passed to the runner container as `GITHUB_API` |
| `GITLAB_API_URL` | No default; overrides the GitLab instance URL for API calls (tests only) |
| `ZROK_SHARE_NAME` | Only for `pnpm run dev:expose`, the zrok share name (`public:<name>`) |
| `LOCAL_API_TOKEN`, `LOCAL_PROJECT_ID` | Local mode on `/local`, development only (see above) |

The build (`pnpm run build`) needs none of these. They are read at runtime only.

## Database and migrations

Schema in `src/db/schema.ts`. Migrations are generated, not written:

```bash
pnpm run db:generate-migrations   # after schema changes, commit the result in src/db/migrations/
pnpm run db:migrate               # manually; otherwise runs automatically on start
pnpm run db:studio                # Drizzle Studio on port 8081
```

## Scripts

| Script | Purpose |
|---|---|
| `dev`, `build`, `serve` | Vite dev server, production build, preview |
| `dev:all` | `scripts/dev.sh`: PostgreSQL and dev server together, both stop on exit |
| `check`, `check:fix`, `lint`, `format` | Biome |
| `typecheck` | `tsc --noEmit` |
| `codegen` | Types, zod schemas and the GitLab client from the specs ([codegen.md](codegen.md)) |
| `spec:update` | Regenerate the upstream subsets in `openapi/upstream/` (run `codegen` afterwards) |
| `test`, `test:integration`, `test:all` | Unit tests, Testcontainers tests, both ([testing.md](testing.md)) |
| `db:start`, `db:stop` | Local PostgreSQL via `scripts/dev-db.sh` (`rm` also deletes the volume) |
| `db:push`, `db:generate-migrations`, `db:migrate`, `db:studio` | Drizzle |
| `runner:build` | Build both runner images locally ([runner-image.md](runner-image.md)) |
| `image:build` | Build the extension image locally (`docker/extension/Dockerfile`) |
| `init:encryption` | Generate encryption secrets into `.env` |

All tool configs live in `config/` and are passed by the scripts via `--config`.
Tools invoked directly need the parameter as well, e.g.
`pnpm exec vitest run --config config/vitest.config.ts`.

## Before committing

See [AGENTS.md](../AGENTS.md): generated code up to date, `check`, `typecheck`, `build`,
integration tests, docs updated.
