# Contributing

Thanks for taking the time. This page covers the process. The working rules for the
code itself (language, codegen, validation, style, documentation duty) are in
[AGENTS.md](../AGENTS.md) and apply to every change.

## Before you start

- Bug or small fix: open a pull request directly.
- New feature, new provider, change to the API contract: open an issue first so the
  design is settled before code exists. Providers follow
  [docs/providers.md](../docs/providers.md).
- Security problem: do not open an issue, see [SECURITY.md](SECURITY.md).

## Setup

```bash
corepack enable && pnpm install
cp .env.example .env && pnpm run init:encryption
pnpm run dev:all
```

Details, environment variables and the mStudio side in
[docs/development.md](../docs/development.md) and
[docs/mstudio-setup.md](../docs/mstudio-setup.md).

## Pull requests

1. Branch from `main`.
2. Keep the change focused. One topic per pull request.
3. Run the checks from [AGENTS.md](../AGENTS.md#run-before-committing). CI runs the
   same steps and blocks merging on failure.
4. Update the documentation in the same commit when behavior, configuration, scripts,
   environment variables or structure change. The checklist is in AGENTS.md.
5. Use Conventional Commits: `feat:`, `fix:`, `docs:`, `ci:`, `chore:`, `refactor:`,
   `test:`. Release notes are grouped by these prefixes.
6. User-facing text goes into both catalogs under `src/i18n/`, English and German.

Pull requests are squash-merged. The pull request title becomes the commit message, so
write it like a commit subject.

## What is out of scope

- Docker-in-Docker or a Docker daemon in the runner. Container Hosting runs no
  privileged containers; `docker build` goes through the builder service and
  containers through the Docker API service (`docker/docker-api`).
- Hand-written code where a generator exists ([docs/codegen.md](../docs/codegen.md)).

## License

By contributing you agree that your contribution is licensed under the
[MIT License](../LICENSE).
