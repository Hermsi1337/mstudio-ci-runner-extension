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
pnpm run db:start               # PostgreSQL on port 5433 (docker run, scripts/dev-db.sh)
pnpm run dev                    # extension on http://localhost:3000
pnpm run dev:expose             # zrok tunnel (ZROK_RESERVED_TOKEN in .env)
```

Chromium-based browsers block the mStudio WebSocket connection to `localhost`.
Firefox works.

## Environment variables

Defined and validated in `src/env.ts`, template in `.env.example`.

| Variable | Meaning |
|---|---|
| `PORT` | HTTP port, default `3000` |
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `POSTGRES_HOST`, `POSTGRES_PORT`, `POSTGRES_USE_SSL` | Database |
| `EXTENSION_ID`, `EXTENSION_SECRET` | From mStudio ([mstudio-setup.md](mstudio-setup.md)) |
| `ENCRYPTION_MASTER_PASSWORD`, `ENCRYPTION_SALT` | Key for encrypted columns |
| `RUN_MIGRATIONS_ON_STARTUP` | Default `true` |
| `RUNNER_IMAGE_GITHUB` | Image for GitHub runners, default `ghcr.io/hermsi1337/mstudio-ci-runner-github:latest` |
| `RUNNER_IMAGE_GITLAB` | Image for GitLab runners, default `ghcr.io/hermsi1337/mstudio-ci-runner-gitlab:latest` |
| `MITTWALD_API_URL` | Default `https://api.mittwald.de/`; the Prism mock in tests |
| `GITHUB_API_URL` | Default `https://api.github.com`; the Prism mock in tests; also passed to the runner container as `GITHUB_API` |
| `GITLAB_API_URL` | No default; overrides the GitLab instance URL for API calls (tests only) |
| `ZROK_RESERVED_TOKEN` | Only for `pnpm run dev:expose` |

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
