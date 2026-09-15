# Marketplace listing

Texts and assets for the extension entry in the mStudio marketplace. The
screenshots in this directory are taken from the hosted extension inside
mStudio; `logo.png` is a copy of `src/assets/logo.png`.

Limits per language: subtitle 40 characters, brief description 300
characters, detailed description unlimited. The texts below fit. The
marketplace form offers one field per text; the second language is set
through the mStudio API.

## Subtitle (max 40 characters)

**de:** Self-hosted Runner für GitHub & GitLab

**en:** Self-hosted runners for GitHub & GitLab

## Brief description (max 300 characters)

**de:** Betreibe deine CI-Runner direkt in deinem mittwald Projekt. Runner
anlegen, Registrierungsbefehl aus GitHub oder GitLab einfügen, fertig: der
Container startet auf Container Hosting und registriert sich selbst. Deine
Jobs laufen auf deiner eigenen Infrastruktur.

**en:** Run your CI runners inside your mittwald project. Create a runner,
paste the setup command from GitHub or GitLab, done: the container starts on
Container Hosting and registers itself. Your jobs run on your own
infrastructure.

## Detailed description (Markdown)

**de:**

```markdown
**CI Runner** bringt self-hosted Runner für GitHub Actions und GitLab CI in
dein mittwald Projekt. Jeder Runner ist ein Container auf Container Hosting:
Runner desselben Repositorys, derselben Organisation oder GitLab-Instanz
teilen sich einen Container-Stack, jeder Runner registriert sich beim Start
selbst.

## So funktioniert es

1. CI-System wählen (GitHub Actions oder GitLab CI)
2. Registrierungsbefehl von der "New self-hosted runner"-Seite einfügen
3. Größe wählen, anlegen

Nach unter einer Minute nimmt der Runner Jobs an.

## Features

- **GitHub Actions:** Repositorys und Organisationen, Registrierung mit dem
  Befehl von der "New self-hosted runner"-Seite
- **GitLab CI:** Projekte, Gruppen oder ganze Instanzen, gitlab.com und
  self-hosted, mehrere Jobs gleichzeitig pro Runner
- **Größen:** Presets von Small bis Large plus frei wählbare CPU- und
  RAM-Limits
- **Cache:** Persistenter Cache für Paketmanager (npm, pnpm, Yarn, pip,
  Composer, Go) mit automatischem Aufräum-Cronjob
- **Verwaltung:** Logs, Neustart, Einstellungen und Updates direkt in
  mStudio, inklusive Update-Hinweis und Changelog
- **Sicherheit:** Bei GitHub werden Registrierungs-Tokens nicht gespeichert. Bei
  GitLab liegt der Runner-Token verschlüsselt vor, ein PAT nutzt die Extension nur
  einmal zum Anlegen des Runners und speichert ihn nicht

## Gut zu wissen

Die Runner laufen ohne Docker-Daemon: Jobs laufen direkt auf Ubuntu 24.04,
die Keywords `container:` und `services:` funktionieren nicht. Pakete lassen
sich per `sudo apt-get` nachinstallieren. Jobs laufen mit sudo-Rechten im
Container, nutze daher einen Runner pro Vertrauensbereich und lass keine
fremden Pull Requests darauf laufen.

Die Extension ist Open Source (MIT):
[github.com/Hermsi1337/mstudio-ci-runner-extension](https://github.com/Hermsi1337/mstudio-ci-runner-extension)
```

**en:**

```markdown
**CI Runner** brings self-hosted runners for GitHub Actions and GitLab CI
into your mittwald project. Every runner is a container on Container
Hosting: runners of the same repository, organization or GitLab instance
share one container stack, and every runner registers itself on start.

## How it works

1. Pick the CI system (GitHub Actions or GitLab CI)
2. Paste the setup command from the "New self-hosted runner" page
3. Choose a size, create

The runner picks up jobs in under a minute.

## Features

- **GitHub Actions:** repositories and organizations, registration with the
  command from the "New self-hosted runner" page
- **GitLab CI:** projects, groups or whole instances, gitlab.com and
  self-hosted, several concurrent jobs per runner
- **Sizes:** presets from small to large plus custom CPU and RAM limits
- **Cache:** persistent cache for package managers (npm, pnpm, Yarn, pip,
  Composer, Go) with an automatic cleanup cronjob
- **Management:** logs, restart, settings and updates inside mStudio,
  including an update hint and a changelog
- **Security:** for GitHub, registration tokens are never stored. For GitLab, the
  runner token is stored encrypted; a PAT is used once to create the runner and never
  stored

## Good to know

The runners run without a Docker daemon: jobs run directly on Ubuntu 24.04,
the `container:` and `services:` keywords do not work. Packages can be
installed with `sudo apt-get`. Jobs run with sudo inside the container, so use
one runner per trust boundary and keep untrusted pull requests off it.

The extension is open source (MIT):
[github.com/Hermsi1337/mstudio-ci-runner-extension](https://github.com/Hermsi1337/mstudio-ci-runner-extension)
```

## Assets

| File | Use |
|---|---|
| `logo.png` | Marketplace logo |
| `overview.png` | Runner list with a running GitHub runner |
| `create-choice.png` | Create flow, CI system choice |
| `create-form.png` | Create flow, GitHub form with resource summary |
