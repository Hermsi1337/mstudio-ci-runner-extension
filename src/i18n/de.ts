import type { Messages } from "./index.ts";

export const de: Messages = {
    "app.title": "CI Runner",
    "app.dockerNotice.title": "Kein Docker in den Runnern",
    "app.dockerNotice.text":
        "Die Runner laufen im mittwald Container Hosting ohne Docker-Daemon. GitHub-Workflows mit container:, services: oder docker build und GitLab-Jobs, die auf image: angewiesen sind, schlagen fehl. Normale Jobs (Node, PHP, Composer, Python, rsync, SSH-Deploys) laufen problemlos.",

    "local.heading": "Lokaler Modus",
    "local.text":
        "Diese Seite läuft außerhalb von mStudio. Anfragen nutzen LOCAL_API_TOKEN gegen das Projekt LOCAL_PROJECT_ID. In Produktion nicht verfügbar.",

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
    "form.github.tokenType.label": "Authentifizierung",
    "form.github.tokenType.registration": "Registrierungs-Token von GitHub",
    "form.github.tokenType.pat": "Personal Access Token (PAT)",
    "form.github.registrationToken.label": "Registrierungs-Token",
    "form.github.registrationToken.description":
        'Das Token von der Seite "New self-hosted runner" auf GitHub. Eine Stunde gültig, wird einmal zum Registrieren des Containers genutzt.',
    "form.github.registrationToken.required": "Registrierungs-Token fehlt",
    "form.github.token.label": "GitHub-Token (PAT)",
    "form.github.token.description":
        'Fine-grained PAT mit "Administration: Read and write" (Repository) oder "Self-hosted runners: Read and write" (Organisation). Wird verschlüsselt gespeichert und dem Container als Umgebungsvariable übergeben.',
    "form.github.token.required": "GitHub-Token fehlt",
    "form.github.runnerGroup.label": "Runner-Gruppe",
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

    "help.open": "Hilfe zu {subject}",
    "form.provider.help":
        "Wähle, wo sich der Runner registriert. GitHub-Actions-Runner erscheinen unter Settings, Actions, Runners des Repositorys oder der Organisation. GitLab-CI-Runner erscheinen unter Settings, CI/CD, Runners des Projekts oder der Gruppe.",
    "form.name.help":
        "Wird als Runner-Name in GitHub oder GitLab und in dieser Liste angezeigt. Buchstaben, Ziffern und Bindestriche bleiben erhalten, alle anderen Zeichen werden zu Bindestrichen.",
    "form.github.target.help":
        "Für eine Organisation gibst du ihren Namen an, zum Beispiel meine-org. Für ein einzelnes Repository owner/repo, zum Beispiel meine-org/mein-repo. Ein Organisations-Runner bedient alle Repositorys, die seine Runner-Gruppe erlaubt.",
    "form.github.tokenType.help":
        "Registrierungs-Token: Öffne auf GitHub die Runner-Einstellungen des Repositorys oder der Organisation, klicke New self-hosted runner und kopiere das Token aus dem config-Befehl. Der Runner registriert sich einmal und behält die Registrierung über Neustarts. Es wird kein PAT gespeichert. Ephemerale Runner gehen damit nicht, weil das Token nach einer Stunde abläuft.\nPersonal Access Token: Der Container holt sich Registrierungs- und Entfernungs-Token selbst. Nötig für ephemerale Runner. Das PAT wird verschlüsselt gespeichert und liegt im Container.",
    "form.github.registrationToken.help":
        "Öffne auf GitHub Settings, Actions, Runners, New self-hosted runner für das oben eingetragene Repository oder die Organisation. Kopiere das Token aus dem config.sh-Befehl, es sieht aus wie AEBIHM56SBF3SULYYYY3BH3KU333M. Das Token läuft nach einer Stunde ab, lege den Runner also direkt an. Der Runner behält seine Registrierung in einem Volume und übersteht Neustarts. Beim Löschen meldet er sich ab, solange das Token noch gültig ist; sonst entfernt GitHub den Offline-Runner nach 14 Tagen.",
    "form.github.registrationToken.link":
        "Runner-Einrichtung auf GitHub öffnen",
    "form.github.token.help":
        "Der Runner registriert sich mit einem Personal Access Token. Lege auf GitHub unter Settings, Developer settings, Personal access tokens ein Fine-grained Token an. Repository: Berechtigung Administration, read and write. Organisation: Berechtigung Self-hosted runners, read and write.\nDas Token wird verschlüsselt gespeichert und an den Runner-Container übergeben, der damit bei jedem Start ein Registrierungs-Token holt. Mitglieder mit Zugriff auf den Container können es lesen, halte den Umfang daher klein.",
    "form.github.token.link": "Fine-grained Token auf GitHub anlegen",
    "form.github.runnerGroup.help":
        "Nur für Organisationen. Runner-Gruppen steuern, welche Repositorys den Runner nutzen dürfen. Leer lassen für die Gruppe Default.",
    "form.github.ephemeral.help":
        "Ein ephemeraler Runner nimmt genau einen Job an, meldet sich ab und registriert sich neu mit leerem Arbeitsverzeichnis. Sicherer bei fremdem Code, pro Job langsamer, weil jeder Job mit einer frischen Registrierung startet.",
    "form.gitlab.instanceUrl.help":
        "https://gitlab.com für den gehosteten Dienst oder die Basis-URL deiner eigenen Instanz, zum Beispiel https://gitlab.example.com.",
    "form.gitlab.runnerType.help":
        "Projekt: bedient ein Projekt, du brauchst die Rolle Maintainer. Gruppe: bedient alle Projekte einer Gruppe, du brauchst die Rolle Owner. Instanz: bedient die ganze Instanz, du musst Administrator sein.",
    "form.gitlab.path.help":
        "Der Pfad wie in der URL des Projekts oder der Gruppe, zum Beispiel meine-gruppe/mein-projekt oder meine-gruppe/untergruppe.",
    "form.gitlab.token.help":
        "Lege unter User settings, Access tokens ein Personal Access Token mit den Scopes create_runner und api an. Das Token wird einmal zum Registrieren des Runners genutzt und nicht gespeichert. Der Container erhält nur das Runner-Token.",
    "form.gitlab.token.link": "Token auf GitLab anlegen",
    "form.gitlab.runUntagged.help":
        "Aktiv: der Runner nimmt auch Jobs ohne Tags an. Inaktiv: nur Jobs, die eines der Runner-Tags nennen, laufen hier.",
    "form.labels.help":
        "Kommagetrennte Labels, mit denen sich der Runner registriert. Im Workflow referenzierst du sie mit runs-on: [self-hosted, mittwald]. Jobs mit anderen Labels erreichen diesen Runner nicht.",
    "form.tags.help":
        "Kommagetrennte Tags, mit denen sich der Runner registriert. In der Pipeline referenzierst du sie mit tags: [mittwald]. Jobs mit anderen Tags erreichen diesen Runner nicht, außer Jobs ohne Tags sind erlaubt.",
    "form.size.help":
        "CPU- und Speicherlimit des Runner-Containers, zählt zu den Container-Hosting-Ressourcen dieses Projekts. Klein reicht für Skripte und Deployments, Mittel für Builds mit npm oder Composer, Groß für parallele Testsuiten.",

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
    "error.github.ephemeralNeedsPat":
        "Ephemerale Runner brauchen ein Personal Access Token. Ein Registrierungs-Token läuft nach einer Stunde ab und kann den Runner nicht neu registrieren.",
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
