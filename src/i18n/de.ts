import type { Messages } from "./index.ts";

export const de: Messages = {
    "app.title": "CI Runner",
    "app.dockerNotice.title": "Kein Docker in den Runnern",
    "app.dockerNotice.text":
        "Die Runner laufen im mittwald Container Hosting ohne Docker-Daemon. GitHub-Workflows mit container:, services: oder docker build und GitLab-Jobs, die auf image: angewiesen sind, schlagen fehl. Normale Jobs (Node, PHP, Composer, Python, rsync, SSH-Deploys) laufen problemlos.",

    "runners.heading": "Runner",
    "runners.intro":
        "Jeder Runner ist ein eigener Container-Stack in diesem Projekt und registriert sich beim Start selbst bei GitHub oder GitLab. Beim Löschen wird die Registrierung entfernt.",
    "runners.empty.heading": "Noch keine Runner",
    "runners.empty.text":
        'Lege über "Runner anlegen" den ersten CI-Runner in diesem Projekt an.',
    "runners.column.name": "Name",
    "runners.column.provider": "CI-System",
    "runners.column.target": "Ziel",
    "runners.column.labels": "Labels",
    "runners.column.size": "Größe",
    "runners.column.status": "Status",
    "runners.column.actions": "Aktionen",
    "runners.action.logs": "Logs",
    "runners.action.restart": "Neustart",
    "runners.action.delete": "Löschen",
    "runners.ephemeralSuffix": "(ephemeral)",
    "runners.logs.heading": "Logs: {name}",
    "runners.logs.empty": "(noch keine Logs)",

    "provider.github": "GitHub Actions",
    "provider.gitlab": "GitLab CI",

    "status.running": "Läuft",
    "status.starting": "Startet",
    "status.creating": "Wird erstellt",
    "status.stopping": "Stoppt",
    "status.stopped": "Gestoppt",
    "status.error": "Fehler",
    "status.missing": "Stack fehlt",
    "status.unknown": "Unbekannt",

    "form.create.button": "Runner anlegen",
    "form.create.heading": "Runner anlegen",
    "form.cancel": "Abbrechen",
    "form.provider.label": "CI-System",
    "form.name.label": "Name",
    "form.name.description": "Wird als Runner-Name im CI-System verwendet.",
    "form.name.required": "Bitte einen Namen angeben",
    "form.github.target.label": "GitHub-Organisation oder -Repository",
    "form.github.target.placeholder": "owner oder owner/repo",
    "form.github.target.description":
        "Organisation (zum Beispiel meine-org) oder Repository (zum Beispiel meine-org/mein-repo).",
    "form.github.target.required": "Organisation oder Repository fehlt",
    "form.github.token.label": "GitHub-Token (PAT)",
    "form.github.token.description":
        'Fine-grained PAT mit "Administration: Read and write" (Repository) oder "Self-hosted runners: Read and write" (Organisation). Wird verschlüsselt gespeichert und dem Container als Umgebungsvariable übergeben.',
    "form.github.token.required": "GitHub-Token fehlt",
    "form.github.runnerGroup.label": "Runner-Gruppe (optional)",
    "form.github.ephemeral.label": "Ephemeral (neue Registrierung pro Job)",
    "form.gitlab.instanceUrl.label": "GitLab-Instanz",
    "form.gitlab.instanceUrl.description":
        "https://gitlab.com oder die URL deiner eigenen Instanz.",
    "form.gitlab.instanceUrl.required": "GitLab-URL fehlt",
    "form.gitlab.runnerType.label": "Runner-Typ",
    "form.gitlab.runnerType.project": "Projekt",
    "form.gitlab.runnerType.group": "Gruppe",
    "form.gitlab.runnerType.instance": "Instanz (Admin)",
    "form.gitlab.projectPath.label": "Projektpfad",
    "form.gitlab.groupPath.label": "Gruppenpfad",
    "form.gitlab.path.placeholder": "gruppe/projekt",
    "form.gitlab.path.required": "Pfad fehlt",
    "form.gitlab.token.label": "GitLab-Token (PAT)",
    "form.gitlab.token.description":
        "Personal Access Token mit den Scopes create_runner und api. Wird nur zum Anlegen des Runners genutzt, der Container erhält ausschließlich das Runner-Token.",
    "form.gitlab.token.required": "GitLab-Token fehlt",
    "form.gitlab.runUntagged.label": "Auch Jobs ohne Tags ausführen",
    "form.labels.label": "Labels",
    "form.tags.label": "Tags",
    "form.labels.description":
        "Kommagetrennt. GitHub: runs-on: [self-hosted, mittwald], GitLab: tags: [mittwald].",
    "form.size.label": "Größe",
    "form.size.small": "Klein (0,5 CPU, 1 GB RAM)",
    "form.size.medium": "Mittel (1 CPU, 2 GB RAM)",
    "form.size.large": "Groß (2 CPU, 4 GB RAM)",

    "error.generic": "Da ist etwas schiefgelaufen",
    "error.fallback.heading": "Ups.",
    "error.fallback.text": "Hier ist etwas schiefgelaufen.",
    "error.fallback.retry": "Erneut versuchen",
    "error.unexpected": "Ein unerwarteter Fehler ist aufgetreten",
    "error.permissions":
        "Nicht genug Berechtigungen. Entweder darfst du in diesem Projekt keine Container verwalten oder der Extension fehlt ein Scope (stack:read, stack:write, stack:delete).",
    "error.notFound.runner": "Der Runner wurde nicht gefunden.",
    "error.notFound.runnerContainer":
        "Der Runner-Container wurde nicht gefunden.",
    "error.upstream.stackCreate":
        "Der Stack konnte nicht angelegt werden (Status {status}).",
    "error.upstream.stackDeclare":
        "Der Runner-Container konnte nicht angelegt werden (Status {status}).",
    "error.upstream.logs":
        "Die Logs konnten nicht geladen werden (Status {status}).",
    "error.upstream.stackDelete":
        "Der Stack konnte nicht gelöscht werden (Status {status}).",
    "error.github.unreachable": "GitHub ist nicht erreichbar: {reason}",
    "error.github.tokenInvalid": "Das GitHub-Token ist ungültig.",
    "error.github.noAccessRepo":
        'Das Token darf keine Runner für das Repository {owner}/{repo} verwalten, oder das Repository existiert nicht. Fine-grained PAT: "Administration: Read and write".',
    "error.github.noAccessOrg":
        'Das Token darf keine Runner für die Organisation {org} verwalten, oder die Organisation existiert nicht. Fine-grained PAT: "Self-hosted runners: Read and write".',
    "error.github.status": "GitHub hat mit Status {status} geantwortet.",
    "error.gitlab.tokenInvalid": "Das GitLab-Token ist ungültig.",
    "error.gitlab.noAccessProject":
        "Das Token darf das Projekt {path} nicht verwalten. Benötigte Scopes: create_runner und api (Maintainer).",
    "error.gitlab.noAccessGroup":
        "Das Token darf die Gruppe {path} nicht verwalten. Benötigte Scopes: create_runner und api (Owner).",
    "error.gitlab.noAccessRunner":
        "Das Token darf keine Runner anlegen. Benötigte Scopes: create_runner und api.",
    "error.gitlab.projectNotFound": "Das Projekt {path} wurde nicht gefunden.",
    "error.gitlab.groupNotFound": "Die Gruppe {path} wurde nicht gefunden.",
    "error.gitlab.status": "GitLab hat mit Status {status} geantwortet.",
    "error.gitlab.projectPathRequired":
        "Der Projektpfad fehlt (zum Beispiel gruppe/projekt).",
    "error.gitlab.groupPathRequired": "Der Gruppenpfad fehlt.",
    "error.gitlab.removeFailed":
        "Der GitLab-Runner konnte nicht entfernt werden (Status {status}).",
};
