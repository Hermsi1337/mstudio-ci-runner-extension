# AGENTS.md

Working rules for this repository. They apply to humans and AI agents alike.
`CLAUDE.md` is a symlink to this file.

## What this is

A mittwald mStudio extension that provisions CI runners (GitHub Actions, GitLab CI,
more providers later) as container stacks on mittwald Container Hosting. Overview in
the [README](README.md), details in [docs/](docs/README.md).

## Ground rules

1. **English in the repository, two languages for users.** Code, comments, docs and
   commit messages are English. Text shown to users (UI, error messages) lives in the
   catalogs under `src/i18n/` in English and German and is never hard-coded
   ([docs/i18n.md](docs/i18n.md)).
2. **Spec first, as little hand-written code as possible.** Contracts live in specs,
   code is generated from them ([docs/codegen.md](docs/codegen.md)). New fields or
   endpoints start in `openapi/extension-api.yaml`, followed by `pnpm run codegen`.
   Never edit files under `src/generated/`, `openapi/upstream/` or `src/routeTree.gen.ts`.
3. **Validation only through generated schemas.** Server functions use the zod
   schemas from `src/generated/extension-api/zod.gen.ts`. No hand-written zod objects
   for request or response data.
4. **Upstream clients instead of raw HTTP.** mittwald via `@mittwald/api-client`,
   GitHub via `@octokit/rest`, GitLab via the hey-api client in `src/generated/gitlab/`.
   All of them are generated from the respective OpenAPI documents.
5. **Providers stay behind the interface.** Provider specifics live in
   `src/domain/providers/<name>.ts`, never in `runner.ts` or the UI table
   ([docs/providers.md](docs/providers.md)).
6. **Integration tests with Testcontainers.** Tests start their dependencies
   (PostgreSQL, Prism mocks, runner images) through Docker themselves. No Docker
   Compose, neither in tests nor for development ([docs/testing.md](docs/testing.md)).
7. **Code reads like a book.** No comments except those that add context the code
   cannot express: why a workaround exists, which external constraint applies, which
   flow a module implements. Never describe what a line does.
8. **Documentation is part of the commit.** Every commit that changes behavior,
   configuration, scripts, environment variables, scopes, flows or structure updates
   the affected docs in the same commit. Stale docs are bugs. See below.
9. **Conventional Commits.** `feat:`, `fix:`, `docs:`, `ci:`, `chore:`, `refactor:`, `test:`.
10. **Images are built from tags only.** Never from pushes to `main`. A pre-release tag
    (`v1.2.3-beta.1`) may come from any branch, goes into the development installation
    only and never bumps `main` ([docs/operations.md](docs/operations.md)).
11. **Writing style.** All text, in every language, follows the rules below.
12. **UI follows the style guide.** Every screen, modal, list and text in mStudio
    follows [docs/styleguide.md](docs/styleguide.md): Flow components only, one
    layout for every width, no text without a container, tested inside mStudio.
13. **Progressive disclosure.** UI, docs and agent-facing text show what most readers
    need first and keep details, edge cases and background one step away.
    UI: optional and advanced options sit one step away from required fields;
    [docs/styleguide.md](docs/styleguide.md#principles) says how. Docs: every file opens with
    a lead of two or three sentences that says what it covers and when to read it. The
    README is an entry point that links instead of explaining. Agent-facing files: this
    file keeps only rules that apply to every change; topic details live in `docs/` and
    are linked.

## Writing style

Applies to docs, UI texts, error messages, comments and commit messages, in English and
German alike. The goal is text that reads like a person wrote it for a colleague.

- Short sentences, one idea each. Active voice. Say what happens, not what "may" happen.
- No em dashes or en dashes as punctuation. Use a comma, a period or parentheses.
- No filler: "simply", "just", "seamlessly", "robust", "powerful", "leverage",
  "streamline", "note that", "it's worth noting", "in order to".
- No rhetorical triads or lists of adjectives for effect. No exclamation marks, no emoji.
- No summaries that repeat what was just said. No introductions that announce content.
- Name concrete things: the file, the variable, the command, the status code.
- UI labels are short noun phrases in sentence case. Buttons use verbs ("Create runner").
- German texts use "du", never "Sie", and native phrasing, not translated English.
- Error messages state what failed and what the user can do, in one or two sentences.

## Maintaining the documentation

Documentation is split by topic. Not everything goes into the README, not everything
into this file. Every file has exactly one topic and links to the others.

| File | Topic |
|---|---|
| `README.md` | Entry point: what, for whom, limitations, links. Keep it short. |
| `AGENTS.md` | Working rules, conventions, documentation duty. No feature docs. |
| `docs/README.md` | Index of the documentation |
| `docs/architecture.md` | Building blocks, data flow, data model, webhooks, security, project structure |
| `docs/providers.md` | Provider interface, existing providers, how to add one |
| `docs/mstudio-setup.md` | Contributor status, extension registration, scopes, anchors, tokens |
| `docs/development.md` | Local development, environment variables, migrations, scripts |
| `docs/codegen.md` | Every generator, its sources and outputs, workflow for changes |
| `docs/testing.md` | Test setup, Testcontainers, mock servers, how tests run |
| `docs/runner-image.md` | Runner images per provider: env vars, entrypoint, building, workflow examples |
| `docs/image-builds.md` | Building container images from a pipeline: builder service, docker shim, limits |
| `docs/docker-api.md` | Docker API for jobs: adapter, mstudio-init, shared directory, limits |
| `docs/operations.md` | Releases, images, GHCR, CI workflows, deployment to Container Hosting |
| `docs/i18n.md` | Languages: how the locale is chosen, catalogs, adding texts |
| `docs/styleguide.md` | UI rules: components, layout, modals, forms, lists, texts, colors |
| `docs/marketplace/listing.md` | Marketplace entry: where the texts live, logo, screenshots |

Checklist before every commit:

- New or changed environment variable: `src/env.ts`, `.env.example`, `docs/development.md`
  or `docs/operations.md`; for runner variables `docs/runner-image.md`.
- New script in `package.json`: `docs/development.md`.
- New or changed scope, anchor, webhook, token requirement: `docs/mstudio-setup.md`.
- New provider or changed provider behavior: `docs/providers.md`, `docs/runner-image.md`.
- Changed builder, docker shim or build queue protocol: `docs/image-builds.md`.
- Changed Docker API adapter, mstudio-init or its shared directory: `docs/docker-api.md`.
- New or changed user-facing text: both catalogs in `src/i18n/`, `docs/i18n.md` if the
  mechanism changes.
- New or changed screen, modal or component pattern: `docs/styleguide.md`, screenshots
  at 1440, 1024, 768 and 414 px inside mStudio.
- New UI, docs or agent text: essentials first, details one step away (UI per
  [docs/styleguide.md](docs/styleguide.md#principles), docs via a lead and links).
- Change to specs or generators: `docs/codegen.md`.
- New test or new container in tests: `docs/testing.md`.
- New directory or moved module: `docs/architecture.md` and its project structure.
- Change to workflows, images, the release flow or `deploy/mstudio/stack.yaml`:
  `docs/operations.md`.
- Moved config file: script in `package.json`, project structure in
  `docs/architecture.md`, `docs/development.md`.

If a topic fits no existing file: add a file under `docs/`, list it in `docs/README.md`
and in the table above.

## Project structure

The directory tree with one line per directory and key file is in
[docs/architecture.md](docs/architecture.md#project-structure).

The repository root stays lean: only files that tools require there
(`package.json`, `tsconfig.json`, `biome.json`, `.editorconfig`, `.env.example`, `LICENSE`).
Everything else lives in a subdirectory.

## Conventions

- TypeScript strict, Biome for lint and format (`pnpm run check`). Generated files are
  excluded in `biome.json`.
- Go only in `docker/docker-api/`, formatted with `gofmt`, checked with `go vet`.
- Scripts in images and in `scripts/` are bash (`#!/usr/bin/env bash`, `set -euo pipefail`),
  never sh, never Python. JSON is read and written with `jq`, which every image ships.
  The builder image installs bash for this.
- Domain code in `src/domain/` receives the `MittwaldAPIV2Client` as a parameter and
  never creates it, so it stays testable against mock servers.
- Errors reach the client only through subclasses of `PublicError`
  (`src/global-errors.ts`). Unknown errors become a generic localized error body that
  the client reads through `parsePublicError`.
- Logging only through `createLogger(scope)` from `src/logger.ts`, never `console`.
  Server code logs state changes at `info`, lookups and request details at `debug`,
  handled failures at `warn`, unexpected ones at `error`. Never log tokens, secrets or
  the environment of runner containers.
- Domain code must not end up in the client bundle. Client code imports types from
  `src/generated/`, never from `src/domain/` or `src/db/`. Modules reachable from
  `src/start.ts` (global middleware) export nothing but the middleware itself; pure
  helpers live in their own module. `pnpm run check:bundle` verifies the built bundle.

## Run before committing

```bash
pnpm run codegen && git diff --exit-code -- src/generated   # generated code up to date?
pnpm run check && pnpm run typecheck && pnpm run build
pnpm run check:bundle                                        # no server-only code in the client bundle
pnpm run test                                                # unit tests, catalog consistency
pnpm run test:integration                                    # requires Docker
pnpm run docker-api:test                                     # Go tests of docker/docker-api, needs the docker CLI
```

CI runs the same steps (`.github/workflows/ci.yml`).
