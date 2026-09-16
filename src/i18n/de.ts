import type { Messages } from "./index.ts";

export const de: Messages = {
    "brand.heading": "mStudio CI Runner",
    "brand.tagline":
        "Selbst gehostete CI-Runner auf mittwald Container Hosting, verwaltet aus diesem Projekt.",
    "brand.openSource": "Open Source",
    "changelog.action": "Changelog",
    "changelog.heading": "Changelog",
    "changelog.current": "Aktuelle Version",
    "changelog.runner.heading": "Änderungen für {name}",
    "changelog.runner.summary.heading": "Update von {from} auf {to}",
    "changelog.runner.summary.text":
        "Dein Runner läuft mit Image-Version {from}. Aktualisieren erstellt ihn mit Version {to} neu, der Version dieser Extension.",
    "changelog.runner.badge.current": "Läuft auf diesem Runner",
    "changelog.runner.badge.target": "Ziel des Updates",
    "changelog.github": "Auf GitHub ansehen",
    "changelog.empty.heading": "Noch keine Releases",
    "changelog.empty.text":
        "GitHub hat keine Releases geliefert. Versuch es später noch mal.",
    "app.title": "CI Runner",
    "app.dockerNotice.title": "Was im Job geht und was nicht",
    "app.dockerNotice.text":
        "Die Runner laufen im mittwald Container Hosting ohne Docker-Daemon. Jobs laufen direkt auf Ubuntu 24.04.\n\n**Geht**\n\n- Node über `actions/setup-node`, Python, `build-essential`, `git`, `curl`, `rsync`, SSH-Deploys\n- Pakete nachinstallieren mit `sudo apt-get`\n- `docker build` und `docker push`, auch über `docker/build-push-action`, wenn Image-Builds für den Runner an sind. Gebaut wird in einem Builder-Container des Stacks\n\n**Geht nicht**\n\n- `docker run`, `docker compose` und alles andere, das einen Container startet\n- GitHub Actions: `container:`, `services:`, Docker-Container-Actions\n- GitLab CI: `image:`, `services:`\n- BuildKit-Funktionen im Dockerfile: `RUN --mount`, `--secret`, `--ssh`, eine andere Architektur",

    "runners.heading": "Runner",
    "runners.containerHosting.missing.heading": "Container Hosting fehlt",
    "runners.containerHosting.missing":
        "Dieses Projekt unterstützt kein Container Hosting und kann deshalb keine CI-Runner betreiben. Installier die Extension in einem Projekt auf einem Server mit Container Hosting.",
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
    "runners.column.imageBuilds": "Image-Builds",
    "runners.column.version": "Version",
    "runners.action.logs": "Logs",
    "runners.action.restart": "Neustart",
    "runners.action.update": "Aktualisieren",
    "runners.action.configure": "Einstellungen",
    "runners.action.delete": "Löschen",
    "runners.action.changelogSince": "Changelog seit {version}",
    "runners.version.unknown": "Unbekannt",
    "runners.version.updateAvailable": "Update auf {version}",
    "runners.version.updateAvailablePlain": "Update verfügbar",
    "runners.ephemeral": "ephemeral",
    "runners.concurrency": "{jobs} Jobs gleichzeitig",
    "runners.labels.inCiSystem": "In GitLab festgelegt",
    "runners.cache.off": "Aus",
    "runners.cache.limit": "{size} GB",
    "runners.imageBuilds.on": "An",
    "runners.imageBuilds.off": "Aus",
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
        "Der Container wird mit Image-Version {version} neu erstellt. Ein Job, der gerade darauf läuft, schlägt fehl und wird nicht automatisch wiederholt.",
    "runners.update.textPlain":
        "Der Container wird mit dem aktuellen Image neu erstellt. Ein Job, der gerade darauf läuft, schlägt fehl und wird nicht automatisch wiederholt.",
    "runners.delete.heading": "{name} löschen?",
    "runners.delete.text.github":
        "Entfernt den Container und seine Volumes inklusive Cache. Einen von der Extension angelegten Stack löscht der letzte Runner mit, einen selbst gewählten Stack nicht. Ein laufender Job bricht ab. GitHub führt den Runner noch als offline, bis es ihn nach 14 Tagen entfernt; früher löschst du ihn unter `Settings` → `Actions` → `Runners`.",
    "runners.delete.text.gitlab":
        "Entfernt den Runner aus GitLab, den Container und seine Volumes inklusive Cache. Einen von der Extension angelegten Stack löscht der letzte Runner mit, einen selbst gewählten Stack nicht. Ein laufender Job bricht ab. Ist der Container schon weg, bleibt der Runner in GitLab; lösche ihn dort unter `Settings` → `CI/CD` → `Runners`.",
    "runners.logs.heading": "Logs: {name}",
    "runners.logs.empty.heading": "Noch keine Ausgabe",
    "runners.logs.empty.text":
        "Der Container startet noch. Folgen ist an, die Ansicht lädt alle 5 Sekunden neu.",
    "runners.logs.empty.textPaused":
        "Der Container startet noch. Schalte Folgen ein, dann lädt die Ansicht alle 5 Sekunden neu.",
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
        "Beim Speichern wird der Container mit den neuen Einstellungen neu erstellt. Ein Job, der gerade darauf läuft, schlägt fehl und wird nicht automatisch wiederholt. Schaltest du den Cache aus, löscht die Extension das Cache-Volume und seinen Cronjob.",
    "form.summary.heading": "Wird in diesem Projekt angelegt",
    "form.summary.stack.label": "Stack: CI Runner: {target}",
    "form.summary.stack.text":
        "Ein Stack pro Repository, Organisation oder Instanz. Entsteht mit dem ersten Runner, die weiteren teilen ihn.",
    "form.summary.stack.selected.label": "Stack: {name}",
    "form.summary.stack.selected.text":
        "Der Runner läuft in diesem Stack und erreicht dessen Services über ihren Namen. Beim Löschen des Runners bleibt der Stack bestehen.",
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
    "form.summary.builder.label": "Container: builder",
    "form.summary.builder.text":
        "Baut die Images aller Runner in diesem Stack. Ein zusätzlicher Container im Stack, gemeinsam genutzt.",
    "form.section.cache": "Cache",
    "form.section.runner": "Runner",
    "form.section.resources": "Ressourcen",
    "form.configCommand.parsed": "Registriert bei {target}, Token {token}",
    "form.snippet.heading": "In der Pipeline nutzen",
    "form.snippet.text.github":
        "Jobs erreichen diesen Runner über seine Labels in runs-on.",
    "form.snippet.text.gitlab": "Jobs erreichen diesen Runner über seine Tags.",
    "form.provider.question": "Welches CI-System?",
    "form.provider.github.text": "Repositorys und Organisationen",
    "form.provider.gitlab.text": "gitlab.com oder self-hosted",
    "form.provider.change": "CI-System ändern",
    "form.name.label": "Name",
    "form.name.description": "Wird als Runner-Name im CI-System verwendet.",
    "form.name.required": "Bitte einen Namen angeben",
    "form.name.tooShort": "Der Name braucht mindestens 2 Zeichen",
    "form.name.tooLong": "Der Name darf höchstens 64 Zeichen haben",
    "form.github.configCommand.label": "Einrichtungsbefehl von GitHub",
    "form.github.configCommand.description":
        "Füge den config-Befehl von der Seite New self-hosted runner ein. Repository oder Organisation und das Registrierungs-Token werden daraus gelesen.",
    "form.github.configCommand.required": "Einrichtungsbefehl fehlt",
    "form.github.configCommand.invalid":
        "Füge den vollständigen Befehl mit --url https://github.com/... und --token ein.",
    "form.github.runnerGroup.label": "Runner-Gruppe",
    "form.gitlab.configCommand.label": "Register-Befehl von GitLab",
    "form.gitlab.configCommand.description":
        "Füge den gitlab-runner register-Befehl von der Seite New runner ein. Instanz-URL und Runner-Token werden daraus gelesen; Tags und Geltungsbereich hast du dort festgelegt.",
    "form.gitlab.configCommand.required": "Register-Befehl fehlt",
    "form.gitlab.configCommand.invalid":
        "Füge den vollständigen Befehl mit --url https://... und --token glrt-... ein.",
    "form.labels.label": "Labels",
    "form.tags.label": "Tags",
    "form.labels.description":
        "Kommagetrennt. Referenziere sie mit runs-on: [self-hosted, mittwald].",
    "form.stack.label": "Ziel-Stack",
    "form.stack.automatic": "Automatisch (ein Stack pro Ziel)",
    "form.stack.option": "{name} ({services} Services)",
    "form.stack.description":
        "Wähl einen Stack, wenn deine Jobs dessen Services brauchen, zum Beispiel eine Datenbank für Migrations. Stacks, die die Extension für Runner angelegt hat, stehen nicht zur Wahl.",
    "form.stack.help":
        "Container eines Stacks erreichen sich über den Servicenamen im Stack-Netzwerk. Ein Runner im Stack deiner Anwendung kann Migrations oder Integrationstests gegen deren Datenbank fahren. Ohne Auswahl nutzt die Extension einen Stack pro Registrierungsziel und legt ihn mit dem ersten Runner an. Einen hier gewählten Stack löscht die Extension nie, beim Löschen des Runners verschwindet nur dessen Container.",
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
    "form.name.help":
        "Wird als Runner-Name in GitHub oder GitLab und in dieser Liste angezeigt. Buchstaben, Ziffern und Bindestriche bleiben erhalten, alle anderen Zeichen werden zu Bindestrichen.",
    "form.github.configCommand.help":
        "Öffne auf GitHub das Repository oder die Organisation, dann `Settings` → `Actions` → `Runners` → `New self-hosted runner`. Kopiere unter `Configure` die Zeile, die mit `./config.sh` (oder `./config.cmd`) beginnt, und füge sie hier ein. Genutzt werden nur `--url` und `--token`. Das Token läuft nach einer Stunde ab, lege den Runner also direkt an. Nach dem Löschen hier führt GitHub den Runner noch als offline, bis es ihn nach 14 Tagen entfernt.",
    "form.github.runnerGroup.help":
        "Nur für Organisationen. Runner-Gruppen steuern, welche Repositorys den Runner nutzen dürfen. Leer lassen für die Gruppe Default.",
    "form.gitlab.configCommand.help":
        "Öffne auf GitLab das Projekt oder die Gruppe, dann `Settings` → `CI/CD` → `Runners` → `New project runner`. Lege Tags fest und ob Jobs ohne Tags laufen, klicke `Create runner` und kopiere aus Schritt 1 die Zeile `gitlab-runner register`. Nur `--url` und `--token` werden genutzt. Das Token gehört zu diesem Runner; löschst du den Runner hier, verschwindet er auch aus GitLab.",
    "form.labels.help":
        "Kommagetrennte Labels, mit denen sich der Runner registriert. Im Workflow referenzierst du sie mit runs-on: [self-hosted, mittwald]. Jobs mit anderen Labels erreichen diesen Runner nicht.",
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
    "form.imageBuilds.label": "Image-Builds in Jobs",
    "form.imageBuilds.help":
        "Erlaubt docker build in Jobs, obwohl der Container keinen Docker-Daemon hat. Gebaut wird in einem Builder-Container desselben Stacks (kaniko), gepusht wird vom Runner mit den Zugangsdaten aus docker login. Der Builder kommt einmal in den Stack und bedient alle Runner darin. Es gibt keinen Layer-Cache, jeder Build startet beim Base-Image. BuildKit-Funktionen wie RUN --mount, --secret, --ssh und Builds für eine andere Architektur gehen nicht; der docker-Befehl sagt das, statt etwas anderes zu bauen.",
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
    "error.instance.unknown":
        "Diese Installation ist der Extension noch nicht bekannt. Installiere die Extension in mStudio neu und versuch es dann noch mal.",
    "error.notFound.runner": "Der Runner wurde nicht gefunden.",
    "error.notFound.runnerContainer":
        "Der Runner-Container wurde nicht gefunden.",
    "error.notFound.stack":
        "Der gewählte Stack lässt sich nicht verwenden. Wähl einen anderen aus der Liste.",
    "error.upstream.stackCreate":
        "Der Stack konnte nicht angelegt werden (Status {status}).",
    "error.upstream.stackDeclare":
        "Der Runner-Container konnte nicht angelegt werden (Status {status}). {detail}",
    "error.upstream.imageMissing":
        "mittwald kann das Runner-Image {image} nicht laden. Das Image muss existieren und öffentlich lesbar sein. Bei GHCR stell die Sichtbarkeit des Packages auf Public.",
    "error.upstream.logs":
        "Die Logs konnten nicht geladen werden (Status {status}).",
    "error.upstream.recreate":
        "mittwald konnte den Runner-Container nicht neu erstellen (Status {status}). Der Container läuft mit dem bisherigen Image und den bisherigen Einstellungen weiter. Versuch es gleich noch mal.",
    "error.upstream.stackDelete":
        "Der Stack konnte nicht gelöscht werden (Status {status}).",
    "error.upstream.stackGet":
        "Der Runner-Stack konnte nicht geladen werden (Status {status}). Versuch es gleich noch mal.",
    "error.upstream.stackList":
        "Die Stacks des Projekts konnten nicht geladen werden (Status {status}). Versuch es gleich noch mal.",
    "error.upstream.projectGet":
        "Das Projekt konnte nicht geladen werden (Status {status}). Versuch es gleich noch mal.",
    "error.containerHosting.unavailable":
        "Dieses Projekt unterstützt kein Container Hosting und kann deshalb keine CI-Runner betreiben. Installier die Extension in einem Projekt auf einem Server mit Container Hosting.",
    "error.upstream.cronjobCreate":
        "mittwald konnte den Aufräum-Cronjob für den Cache nicht anlegen (Status {status}). Die Extension braucht die Cronjob-Scopes.",
    "error.upstream.cronjobUpdate":
        "mittwald konnte den Aufräum-Cronjob für den Cache nicht ändern (Status {status}).",
    "error.gitlab.instanceUrlInvalid":
        "Die GitLab-URL muss eine öffentliche https-Adresse sein.",
    "error.gitlab.runnerTokenInvalid":
        "GitLab akzeptiert das Runner-Token nicht. Füge den vollständigen register-Befehl von der Seite New runner ein; das Token beginnt mit glrt-.",
    "error.gitlab.status": "GitLab hat mit Status {status} geantwortet.",
    "error.gitlab.removeFailed":
        "Der GitLab-Runner konnte nicht entfernt werden (Status {status}).",
};
