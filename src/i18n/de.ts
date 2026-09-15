import type { Messages } from "./index.ts";

export const de: Messages = {
    "brand.heading": "mStudio CI Runner",
    "brand.tagline":
        "Selbst gehostete CI-Runner auf mittwald Container Hosting, verwaltet aus diesem Projekt.",
    "brand.openSource": "Open Source",
    "app.title": "CI Runner",
    "app.dockerNotice.title": "Kein Docker in den Runnern",
    "app.dockerNotice.text":
        "Die Runner laufen im mittwald Container Hosting ohne Docker-Daemon.\n\n**Geht nicht**\n\n- GitHub Actions: `container:`, `services:`, `docker build`, Docker-Container-Actions\n- GitLab CI: `image:`, `services:`, alles was `docker` aufruft\n\n**Geht**\n\n- Jobs direkt auf Ubuntu 24.04: Node über `actions/setup-node`, Python, `build-essential`\n- `git`, `curl`, `rsync`, SSH-Deploys\n- Pakete nachinstallieren mit `sudo apt-get`",

    "local.heading": "Lokaler Modus",
    "local.text":
        "Diese Seite läuft außerhalb von mStudio. Anfragen nutzen LOCAL_API_TOKEN gegen das Projekt LOCAL_PROJECT_ID. In Produktion nicht verfügbar.",

    "runners.heading": "Runner",
    "runners.intro.heading": "So arbeiten Runner",
    "runners.intro":
        "Runner desselben Repositorys, derselben Organisation oder GitLab-Instanz teilen sich einen Container-Stack in diesem Projekt; jeder Runner ist ein Container darin und registriert sich beim Start selbst. Jobs laufen direkt im Container. Leg so viele Runner an, wie du brauchst.",
    "runners.empty.heading": "Noch keine Runner",
    "runners.empty.text":
        'Lege über "Runner anlegen" den ersten CI-Runner in diesem Projekt an.',
    "runners.search": "Suche nach Name, Ziel oder Label",
    "runners.filter.all": "Alle",
    "runners.group.one": "1 Runner",
    "runners.group.many": "{count} Runner",
    "runners.noMatch.heading": "Kein Runner passt",
    "runners.noMatch.text": "Ändere die Suche oder den Filter.",
    "runners.auth.pat": "PAT",
    "runners.auth.registration": "Registrierungs-Token",
    "runners.filter.provider": "CI-System",
    "runners.column.size": "Größe",
    "runners.column.cache": "Cache",
    "runners.column.version": "Runner-Version",
    "runners.action.logs": "Logs",
    "runners.action.restart": "Neustart",
    "runners.action.update": "Aktualisieren",
    "runners.action.configure": "Einstellungen",
    "runners.action.delete": "Löschen",
    "runners.version.unknown": "Unbekannt",
    "runners.version.updateAvailable": "Update auf {version}",
    "runners.ephemeral": "ephemeral",
    "runners.concurrency": "{jobs} Jobs gleichzeitig",
    "runners.labels.inCiSystem": "In GitLab festgelegt",
    "runners.cache.off": "Aus",
    "runners.cache.limit": "{size} GB",
    "runners.notice.created": "Runner {name} angelegt",
    "runners.notice.createdText":
        "Der Container startet jetzt und registriert sich innerhalb einer Minute.",
    "runners.notice.configured": "Einstellungen von {name} gespeichert",
    "runners.notice.restarted": "Runner {name} startet neu",
    "runners.notice.restartFailed":
        "Runner {name} konnte nicht neu gestartet werden",
    "runners.notice.updated": "Runner {name} wird aktualisiert",
    "runners.notice.updateFailed":
        "Runner {name} konnte nicht aktualisiert werden",
    "runners.notice.deleted": "Runner {name} gelöscht",
    "runners.notice.deleteFailed": "Runner {name} konnte nicht gelöscht werden",
    "runners.restart.heading": "{name} neu starten?",
    "runners.restart.text":
        "Der Container stoppt und startet neu. Ein Job, der gerade darauf läuft, bricht ab.",
    "runners.update.heading": "{name} aktualisieren?",
    "runners.update.text":
        "Der Container wird mit Image-Version {version} neu erstellt. Ein laufender Job bricht ab.",
    "runners.delete.heading": "{name} löschen?",
    "runners.delete.text.github.pat":
        "Entfernt die Registrierung auf GitHub, den Container und seine Volumes inklusive Cache. Der Stack verschwindet mit dem letzten Runner des Ziels. Ein laufender Job bricht ab.",
    "runners.delete.text.github.registration":
        "Entfernt den Container und seine Volumes inklusive Cache. Der Stack verschwindet mit dem letzten Runner des Ziels. Ein laufender Job bricht ab. GitHub führt den Runner noch als offline, bis es ihn nach 14 Tagen entfernt; früher löschst du ihn unter `Settings` → `Actions` → `Runners`.",
    "runners.delete.text.gitlab":
        "Entfernt den Runner aus GitLab, den Container und seine Volumes inklusive Cache. Der Stack verschwindet mit dem letzten Runner des Ziels. Ein laufender Job bricht ab.",
    "runners.logs.heading": "Logs: {name}",
    "runners.logs.empty.heading": "Noch keine Ausgabe",
    "runners.logs.empty.text":
        "Der Container startet noch. Folgen ist an, die Ansicht lädt alle 5 Sekunden neu.",
    "runners.logs.tail": "Zeilen",
    "runners.logs.lines": "Letzte {lines} Zeilen",
    "runners.logs.follow": "Folgen",

    "provider.github": "GitHub Actions",
    "provider.gitlab": "GitLab CI",

    "feedback.heading": "Feedback und Support",
    "feedback.text":
        "Diese Extension ist Open Source und lebt auf GitHub. Jede Meldung und jede Frage hilft.",
    "feedback.issue.heading": "Etwas kaputt?",
    "feedback.issue.text":
        "Ein Runner, der sich nicht registriert, ein falscher Text, ein fehlendes Feature: leg ein Issue mit den Schritten zum Nachstellen an.",
    "feedback.issue.link": "Issue anlegen",
    "feedback.question.heading": "Eine Frage?",
    "feedback.question.text":
        "Welche Größe passt, wie ein Job eine Datenbank erreicht, was der Cache macht: frag in den Discussions.",
    "feedback.question.link": "Discussion starten",
    "feedback.code.heading": "Code ansehen?",
    "feedback.code.text":
        "Extension, Runner-Images und Doku liegen in einem Repository unter MIT-Lizenz. Pull Requests willkommen.",
    "feedback.code.link": "Repository öffnen",

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
    "form.configure.heading": "Einstellungen: {name}",
    "form.configure.button": "Speichern",
    "form.configure.warning.heading": "Der Container wird neu erstellt",
    "form.configure.warning.text":
        "Beim Speichern wird der Stack neu deklariert und mittwald erstellt den Container neu. Ein laufender Job bricht ab. Schaltest du den Cache aus, löscht die Extension das Cache-Volume und seinen Cronjob.",
    "form.summary.heading": "Wird in diesem Projekt angelegt",
    "form.summary.stack.label": "Stack: CI Runner: {target}",
    "form.summary.stack.text":
        "Ein Stack pro Repository, Organisation oder Instanz. Entsteht mit dem ersten Runner, die weiteren teilen ihn.",
    "form.summary.service.label": "Container: {service}",
    "form.summary.service.text": "Begrenzt auf {cpus} CPU und {memory} GB RAM.",
    "form.summary.dataVolume.label": "Volume: {service}-data",
    "form.summary.dataVolume.text.github":
        "Runner-Registrierung und Arbeitsverzeichnis: Checkouts, geladene Actions, Tool-Cache der setup-Actions.",
    "form.summary.dataVolume.text.gitlab":
        "Builds-Verzeichnis und der Speicher hinter dem cache:-Keyword in .gitlab-ci.yml.",
    "form.summary.cacheVolume.label": "Volume: {service}-cache",
    "form.summary.cacheVolume.text":
        "Paketmanager-Cache. Die Belegung ist in mStudio separat sichtbar.",
    "form.summary.cronjob.label": "Cronjob: Cache aufräumen",
    "form.summary.cronjob.text":
        "Kürzt das Cache-Volume stündlich auf {size} GB.",
    "form.section.cache": "Cache",
    "form.section.runner": "Runner",
    "form.section.resources": "Ressourcen",
    "form.configCommand.parsed": "Registriert bei {target}, Token {token}",
    "form.snippet.heading": "In der Pipeline nutzen",
    "form.snippet.text.github":
        "Jobs erreichen diesen Runner über seine Labels in runs-on.",
    "form.snippet.text.gitlab": "Jobs erreichen diesen Runner über seine Tags.",
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
    "form.github.configCommand.label": "Einrichtungsbefehl von GitHub",
    "form.github.configCommand.description":
        "Füge den config-Befehl von der Seite New self-hosted runner ein. Repository oder Organisation und das Registrierungs-Token werden daraus gelesen.",
    "form.github.configCommand.required": "Einrichtungsbefehl fehlt",
    "form.github.configCommand.invalid":
        "Füge den vollständigen Befehl mit --url https://github.com/... und --token ein.",
    "form.github.token.label": "GitHub-Token (PAT)",
    "form.github.token.description":
        'Fine-grained PAT mit "Administration: Read and write" (Repository) oder "Self-hosted runners: Read and write" (Organisation). Wird verschlüsselt gespeichert und dem Container als Umgebungsvariable übergeben.',
    "form.github.token.required": "GitHub-Token fehlt",
    "form.github.runnerGroup.label": "Runner-Gruppe",
    "form.github.ephemeral.label": "Ephemeral (neue Registrierung pro Job)",
    "form.gitlab.tokenType.label": "Authentifizierung",
    "form.gitlab.tokenType.registration": "Runner-Token von GitLab",
    "form.gitlab.tokenType.pat": "Personal Access Token (PAT)",
    "form.gitlab.configCommand.label": "Register-Befehl von GitLab",
    "form.gitlab.configCommand.description":
        "Füge den gitlab-runner register-Befehl von der Seite New runner ein. Instanz-URL und Runner-Token werden daraus gelesen; Tags und Geltungsbereich hast du dort festgelegt.",
    "form.gitlab.configCommand.required": "Register-Befehl fehlt",
    "form.gitlab.configCommand.invalid":
        "Füge den vollständigen Befehl mit --url https://... und --token glrt-... ein.",
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
        "Kommagetrennt. Referenziere sie mit runs-on: [self-hosted, mittwald].",
    "form.tags.description":
        "Kommagetrennt. Referenziere sie mit tags: [mittwald].",
    "form.size.label": "Größe",
    "form.size.description":
        "Alle Jobs dieses Runners teilen sich diese Limits.",
    "form.size.small": "Klein (0,5 CPU, 1 GB RAM)",
    "form.size.medium": "Mittel (1 CPU, 2 GB RAM)",
    "form.size.large": "Groß (2 CPU, 4 GB RAM)",
    "form.size.custom": "Individuell",
    "form.size.customValue": "Individuell ({cpus} CPU, {memory} GB RAM)",
    "form.cpus.label": "CPU-Limit",
    "form.cpus.description": "0,25 bis 8 CPUs in Schritten von 0,25.",
    "form.cpus.required": "Gib ein CPU-Limit an",
    "form.cpus.range": "Gib einen Wert zwischen 0,25 und 8 an",
    "form.cpus.help":
        "Anteil an CPU-Kernen, den der Container nutzen darf. Ein Job mit npm oder Composer lastet eine CPU gut aus, Skripte und Deployments kommen mit weniger aus.",
    "form.memory.label": "Speicherlimit (GB)",
    "form.memory.description": "0,5 bis 16 GB in Schritten von 0,5.",
    "form.memory.required": "Gib ein Speicherlimit an",
    "form.memory.range": "Gib einen Wert zwischen 0,5 und 16 an",
    "form.memory.help":
        "Arbeitsspeicher, den der Container nutzen darf. Ein Job, der mehr braucht, wird beendet. Rechne mit etwa 1 GB pro Job, mehr für Testsuiten mit Browser oder Datenbank.",

    "help.open": "Hilfe zu {subject}",
    "form.provider.help":
        "Wähle, wo sich der Runner registriert. GitHub-Actions-Runner erscheinen unter `Settings` → `Actions` → `Runners` des Repositorys oder der Organisation. GitLab-CI-Runner erscheinen unter `Settings` → `CI/CD` → `Runners` des Projekts oder der Gruppe.",
    "form.name.help":
        "Wird als Runner-Name in GitHub oder GitLab und in dieser Liste angezeigt. Buchstaben, Ziffern und Bindestriche bleiben erhalten, alle anderen Zeichen werden zu Bindestrichen.",
    "form.github.target.help":
        "Für eine Organisation gibst du ihren Namen an, zum Beispiel meine-org. Für ein einzelnes Repository owner/repo, zum Beispiel meine-org/mein-repo. Ein Organisations-Runner bedient alle Repositorys, die seine Runner-Gruppe erlaubt.",
    "form.github.tokenType.help":
        "Registrierungs-Token: Öffne auf GitHub die Runner-Einstellungen des Repositorys oder der Organisation, klicke New self-hosted runner und kopiere das Token aus dem config-Befehl. Das Token läuft nach einer Stunde ab, daher registriert sich der Runner einmal und legt die entstehenden Zugangsdaten (ein paar kleine Dateien) in seinem Daten-Volume ab. Neustarts und Updates nutzen sie ohne neues Token. Es wird kein PAT gespeichert. Ephemerale Runner gehen damit nicht, weil jeder Job eine frische Registrierung bräuchte.\nPersonal Access Token: Der Container holt sich Registrierungs- und Entfernungs-Token bei jedem Start selbst und braucht keine gespeicherte Registrierung. Nötig für ephemerale Runner. Das PAT wird verschlüsselt gespeichert und liegt im Container.",
    "form.github.configCommand.help":
        "Öffne auf GitHub das Repository oder die Organisation, dann `Settings` → `Actions` → `Runners` → `New self-hosted runner`. Kopiere unter `Configure` die Zeile, die mit `./config.sh` (oder `./config.cmd`) beginnt, und füge sie hier ein. Genutzt werden nur `--url` und `--token`. Das Token läuft nach einer Stunde ab, lege den Runner also direkt an. Beim Löschen meldet sich der Runner ab, solange das Token gültig ist; sonst entfernt GitHub den Offline-Runner nach 14 Tagen.",
    "form.github.token.help":
        "Der Runner registriert sich mit einem Personal Access Token. Lege auf GitHub unter `Settings` → `Developer settings` → `Personal access tokens` ein Fine-grained Token an. Repository: Berechtigung `Administration: Read and write`. Organisation: Berechtigung `Self-hosted runners: Read and write`.\nDas Token wird verschlüsselt gespeichert und an den Runner-Container übergeben, der damit bei jedem Start ein Registrierungs-Token holt. Mitglieder mit Zugriff auf den Container können es lesen, halte den Umfang daher klein.",
    "form.github.token.link": "Fine-grained Token auf GitHub anlegen",
    "form.github.runnerGroup.help":
        "Nur für Organisationen. Runner-Gruppen steuern, welche Repositorys den Runner nutzen dürfen. Leer lassen für die Gruppe Default.",
    "form.github.ephemeral.help":
        "Ein ephemeraler Runner nimmt genau einen Job an, meldet sich ab und registriert sich neu mit leerem Arbeitsverzeichnis. Sicherer bei fremdem Code, pro Job langsamer, weil jeder Job mit einer frischen Registrierung startet.",
    "form.gitlab.tokenType.help":
        "Runner-Token: Lege den Runner auf GitLab unter `Settings` → `CI/CD` → `Runners` → `New project runner` (oder Group- bzw. Instance-Runner) an, wähle dort die Tags und kopiere auf der Folgeseite den Befehl `gitlab-runner register`. Der Runner existiert damit schon in GitLab, der Container registriert sich mit seinem Token. Kein PAT nötig; das Token wird verschlüsselt gespeichert, um den Runner später zu löschen.\nPersonal Access Token: Die Extension legt den Runner per API an, mit Geltungsbereich, Pfad, Tags und Untagged-Einstellung aus diesem Formular. Das PAT wird einmal genutzt und nicht gespeichert.",
    "form.gitlab.configCommand.help":
        "Öffne auf GitLab das Projekt oder die Gruppe, dann `Settings` → `CI/CD` → `Runners` → `New project runner`. Lege Tags fest und ob Jobs ohne Tags laufen, klicke `Create runner` und kopiere aus Schritt 1 die Zeile `gitlab-runner register`. Nur `--url` und `--token` werden genutzt. Das Token gehört zu diesem Runner; löschst du den Runner hier, verschwindet er auch aus GitLab.",
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
    "form.cache.label": "Dauerhafter Cache für Paketmanager",
    "form.cache.help":
        "Legt ein Cache-Volume unter /home/runner/.cache an und richtet npm, pnpm, yarn, pip, Composer und Go darauf aus (XDG_CACHE_HOME plus die tool-eigenen Variablen). Downloads früherer Jobs werden wiederverwendet, Installationen laufen schneller. Das Volume übersteht Jobs, Neustarts und Updates. Du kannst den Cache später in den Runner-Einstellungen ein- oder ausschalten; beim Ausschalten wird das Volume gelöscht.",
    "form.cacheSize.label": "Cache-Limit (GB)",
    "form.cacheSize.description":
        "Ein stündlicher Cronjob im Projekt löscht die ältesten Dateien oberhalb dieses Limits.",
    "form.cacheSize.required": "Cache-Limit fehlt",
    "form.cacheSize.range": "Gib einen Wert zwischen 1 und 500 GB an",
    "form.cacheSize.help":
        "mittwald-Volumes haben selbst kein Größenlimit, daher legt die Extension im Projekt einen Cronjob an, der stündlich im Runner-Container läuft. Er löscht die am längsten nicht geänderten Dateien, bis der Cache ins Limit passt. Der Cronjob wird mit dem Runner entfernt.",
    "form.concurrency.label": "Jobs gleichzeitig",
    "form.concurrency.required": "Gib an, wie viele Jobs gleichzeitig laufen",
    "form.concurrency.range": "Gib einen Wert zwischen 1 und 8 an",
    "form.concurrency.help":
        "Wie viele Jobs der Runner gleichzeitig annimmt (concurrent in der GitLab-Runner-Config). Alle Jobs teilen sich CPU- und Speicherlimit der Größe. Ein zweiter Job bremst den ersten, und ein Build, der mehr Speicher braucht als seinen Anteil, schlägt fehl.",
    "form.concurrency.recommendation.small":
        "Klein: 1 Job. 0,5 CPU und 1 GB RAM reichen für einen Job.",
    "form.concurrency.recommendation.medium":
        "Mittel: 1 Job, 2 für Skripte und Deployments. Zwei Builds mit npm oder Composer teilen sich 1 CPU und 2 GB RAM.",
    "form.concurrency.recommendation.large":
        "Groß: 2 Jobs, bis zu 4 für Skripte und Deployments. Vier Jobs teilen sich 2 CPUs und 4 GB RAM.",
    "form.concurrency.recommendation.custom":
        "Individuell: etwa ein Job pro CPU und etwa 1 GB RAM pro Job.",
    "form.concurrency.github":
        "Ein GitHub-Runner nimmt einen Job nach dem anderen an. Für parallele Jobs lege mehrere Runner an.",
    "form.size.help":
        "CPU- und Speicherlimit des Runner-Containers, zählt zu den Container-Hosting-Ressourcen dieses Projekts. Klein reicht für Skripte und Deployments, Mittel für Builds mit npm oder Composer, Groß für parallele Testsuiten.",

    "error.generic":
        "Da ist etwas schiefgelaufen. Versuch es noch einmal oder schau in die Runner-Logs.",
    "error.fallback.heading": "Laden fehlgeschlagen",
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
    "error.upstream.cronjobCreate":
        "mittwald konnte den Aufräum-Cronjob für den Cache nicht anlegen (Status {status}). Die Extension braucht die Cronjob-Scopes.",
    "error.upstream.cronjobUpdate":
        "mittwald konnte den Aufräum-Cronjob für den Cache nicht ändern (Status {status}).",
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
    "error.gitlab.runnerTokenInvalid":
        "GitLab akzeptiert das Runner-Token nicht. Füge den vollständigen register-Befehl von der Seite New runner ein; das Token beginnt mit glrt-.",
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
