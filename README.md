# mStudio CI Runner Extension

[![CI](https://github.com/Hermsi1337/mstudio-ci-runner-extension/actions/workflows/ci.yml/badge.svg)](https://github.com/Hermsi1337/mstudio-ci-runner-extension/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/Hermsi1337/mstudio-ci-runner-extension)](https://github.com/Hermsi1337/mstudio-ci-runner-extension/releases)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

A [mittwald mStudio](https://studio.mittwald.de) extension that provisions CI
runners on mittwald Container Hosting with one click. Supports GitHub Actions and
GitLab CI; more providers are planned ([docs/providers.md](docs/providers.md)).

Every runner is its own container stack in the project. The container registers
itself with the CI system on start, and the registration is removed when the
runner is deleted.

## Limitations

Container Hosting provides no Docker daemon. Plain jobs (Node, PHP, Python, Go,
Rust, Bash, deploys via SSH/rsync) work. GitHub `container:`, `services:`,
`docker build` and GitLab `image:`/`services:` do not.

## Documentation

| Topic | File |
|---|---|
| Architecture, data flow, security | [docs/architecture.md](docs/architecture.md) |
| CI providers (GitHub, GitLab, adding new ones) | [docs/providers.md](docs/providers.md) |
| Becoming a contributor, registering the extension, tokens | [docs/mstudio-setup.md](docs/mstudio-setup.md) |
| Local development, environment variables, scripts | [docs/development.md](docs/development.md) |
| Generated code and specs | [docs/codegen.md](docs/codegen.md) |
| Tests | [docs/testing.md](docs/testing.md) |
| Runner images | [docs/runner-image.md](docs/runner-image.md) |
| Releases, images, CI, deployment | [docs/operations.md](docs/operations.md) |
| Languages (English, German) | [docs/i18n.md](docs/i18n.md) |
| Working rules for humans and agents | [AGENTS.md](AGENTS.md) |

Index of all pages: [docs/README.md](docs/README.md).

## Quick start

```bash
corepack enable && pnpm install
cp .env.example .env && pnpm run init:encryption
pnpm run dev:all
```

Continue with [docs/development.md](docs/development.md).

## Origin

Structure and base stack come from the
[mittwald reference extension](https://github.com/mittwald/reference-extension).

## Contributing

Issues and pull requests are welcome. Process in
[CONTRIBUTING.md](.github/CONTRIBUTING.md), working rules in [AGENTS.md](AGENTS.md),
security reports via [SECURITY.md](.github/SECURITY.md).

## License

MIT, see [LICENSE](LICENSE). Copyright (c) 2026 codeBoarder - Inh. Dennis Hermsmeier.
