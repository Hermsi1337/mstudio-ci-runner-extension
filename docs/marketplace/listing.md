# Marketplace listing

Texts and assets for the extension entry in the mStudio marketplace. The
screenshots in this directory are taken from the hosted extension inside
mStudio; `logo.png` is a copy of `src/assets/logo.png`.

## Subtitle

**de:** Self-hosted CI-Runner für GitHub Actions und GitLab CI

**en:** Self-hosted CI runners for GitHub Actions and GitLab CI

## Brief description

**de:** Betreibe deine CI-Runner direkt in deinem mittwald Projekt. Runner
anlegen, Registrierungsbefehl aus GitHub oder GitLab einfügen, fertig: der
Container startet auf Container Hosting und registriert sich selbst. Deine
Jobs laufen auf deiner eigenen Infrastruktur.

**en:** Run your CI runners inside your mittwald project. Create a runner,
paste the setup command from GitHub or GitLab, done: the container starts on
Container Hosting and registers itself. Your jobs run on your own
infrastructure.

## Detailed description

**de:**

CI Runner bringt self-hosted Runner für GitHub Actions und GitLab CI in dein
mittwald Projekt. Jeder Runner ist ein Container auf Container Hosting:
Runner desselben Repositorys, derselben Organisation oder GitLab-Instanz
teilen sich einen Container-Stack, jeder Runner registriert sich beim Start
selbst.

So funktioniert es: CI-System wählen, den Registrierungsbefehl von der "New
self-hosted runner"-Seite einfügen, Größe wählen, anlegen. Nach unter einer
Minute nimmt der Runner Jobs an.

- GitHub Actions: Repositorys und Organisationen, Registrierungs-Token oder
  fine-grained PAT, auf Wunsch ephemere Runner
- GitLab CI: Projekte, Gruppen oder ganze Instanzen, gitlab.com und
  self-hosted, mehrere Jobs gleichzeitig pro Runner
- Größen-Presets von Small bis Large plus frei wählbare CPU- und RAM-Limits
- Persistenter Cache für Paketmanager (npm, pnpm, Yarn, pip, Composer, Go)
  mit automatischem Aufräum-Cronjob
- Logs, Neustart, Einstellungen und Updates direkt in mStudio, inklusive
  Update-Hinweis und Changelog
- Registrierungs-Tokens werden nicht gespeichert, PATs verschlüsselt abgelegt

Die Runner laufen ohne Docker-Daemon: Jobs laufen direkt auf Ubuntu 24.04,
`container:`- und `services:`-Keywords funktionieren nicht. Pakete lassen
sich per sudo apt-get nachinstallieren.

Die Extension ist Open Source (MIT):
https://github.com/Hermsi1337/mstudio-ci-runner-extension

**en:**

CI Runner brings self-hosted runners for GitHub Actions and GitLab CI into
your mittwald project. Every runner is a container on Container Hosting:
runners of the same repository, organization or GitLab instance share one
container stack, and every runner registers itself on start.

How it works: pick the CI system, paste the setup command from the "New
self-hosted runner" page, choose a size, create. The runner picks up jobs in
under a minute.

- GitHub Actions: repositories and organizations, registration token or
  fine-grained PAT, ephemeral runners on demand
- GitLab CI: projects, groups or whole instances, gitlab.com and
  self-hosted, several concurrent jobs per runner
- Size presets from small to large plus custom CPU and RAM limits
- Persistent cache for package managers (npm, pnpm, Yarn, pip, Composer, Go)
  with an automatic cleanup cronjob
- Logs, restart, settings and updates inside mStudio, including an update
  hint and a changelog
- Registration tokens are never stored, PATs are stored encrypted

The runners run without a Docker daemon: jobs run directly on Ubuntu 24.04,
the `container:` and `services:` keywords do not work. Packages can be
installed with sudo apt-get.

The extension is open source (MIT):
https://github.com/Hermsi1337/mstudio-ci-runner-extension

## Assets

| File | Use |
|---|---|
| `logo.png` | Marketplace logo |
| `overview.png` | Runner list with a running GitHub runner |
| `create-choice.png` | Create flow, CI system choice |
| `create-form.png` | Create flow, GitHub form with resource summary |
