export const en = {
    "brand.heading": "mStudio CI Runner",
    "brand.tagline":
        "Self-hosted CI runners on mittwald Container Hosting, managed from this project.",
    "brand.openSource": "Open source",
    "changelog.action": "Changelog",
    "changelog.heading": "Changelog",
    "changelog.current": "Current version",
    "changelog.runner.heading": "Changes for {name}",
    "changelog.runner.summary.heading": "Update from {from} to {to}",
    "changelog.runner.summary.text":
        "Your runner runs image version {from}. Update recreates it with version {to}, the version of this extension.",
    "changelog.runner.badge.current": "Runs on this runner",
    "changelog.runner.badge.target": "Update target",
    "changelog.github": "View on GitHub",
    "changelog.empty.heading": "No releases yet",
    "changelog.empty.text": "GitHub returned no releases. Try again later.",
    "app.title": "CI Runners",
    "app.dockerNotice.title": "What runs in a job, and what does not",
    "app.dockerNotice.text":
        "Runners run on mittwald Container Hosting without a Docker daemon. Jobs run directly on Ubuntu 24.04.\n\n**Works**\n\n- Node via `actions/setup-node`, Python, `build-essential`, `git`, `curl`, `rsync`, SSH deploys\n- Installing packages with `sudo apt-get`\n- `docker build` and `docker push`, including `docker/build-push-action`, when image builds are turned on for the runner. The build runs in a builder container of the stack\n\n**Fails**\n\n- `docker run`, `docker compose` and anything else that starts a container\n- GitHub Actions: `container:`, `services:`, Docker container actions\n- GitLab CI: `image:`, `services:`\n- BuildKit features in a Dockerfile: `RUN --mount`, `--secret`, `--ssh`, another architecture",

    "runners.heading": "Runners",
    "runners.containerHosting.missing.heading": "Container Hosting missing",
    "runners.containerHosting.missing":
        "This project does not support Container Hosting, so it cannot run CI runners. Install the extension in a project on a server that offers Container Hosting.",
    "runners.intro.heading": "How runners work",
    "runners.intro":
        "Runners of the same repository, organization or GitLab instance share one container stack in this project; every runner is a container in it and registers itself on start. Jobs run directly in the container. Create as many runners as you need.",
    "runners.empty.heading": "No runners yet",
    "runners.empty.text":
        'Use "Create runner" to add the first CI runner to this project.',
    "runners.search": "Search by name, target or label",
    "runners.filter.all": "All",
    "runners.group.one": "1 runner",
    "runners.group.many": "{count} runners",
    "runners.noMatch.heading": "No runner matches",
    "runners.noMatch.text": "Change the search or the filter.",
    "runners.auth.pat": "PAT",
    "runners.auth.registration": "Registration token",
    "runners.filter.provider": "CI system",
    "runners.column.size": "Size",
    "runners.column.cache": "Cache",
    "runners.column.imageBuilds": "Image builds",
    "runners.column.version": "Version",
    "runners.action.logs": "Logs",
    "runners.action.restart": "Restart",
    "runners.action.update": "Update",
    "runners.action.configure": "Settings",
    "runners.action.delete": "Delete",
    "runners.action.changelogSince": "Changelog since {version}",
    "runners.version.unknown": "Unknown",
    "runners.version.updateAvailable": "Update to {version}",
    "runners.version.updateAvailablePlain": "Update available",
    "runners.ephemeral": "ephemeral",
    "runners.concurrency": "{jobs} jobs at once",
    "runners.labels.inCiSystem": "Set in GitLab",
    "runners.cache.off": "Off",
    "runners.cache.limit": "{size} GB",
    "runners.imageBuilds.on": "On",
    "runners.imageBuilds.off": "Off",
    "runners.notice.created": "Runner {name} created",
    "runners.notice.createdText":
        "The container starts now and registers within a minute.",
    "runners.notice.configured": "Settings of {name} saved",
    "runners.notice.restarted": "Runner {name} restarts",
    "runners.notice.restartFailed": "Runner {name} could not be restarted",
    "runners.notice.updated": "Runner {name} updates",
    "runners.notice.updateFailed": "Runner {name} could not be updated",
    "runners.notice.deleted": "Runner {name} deleted",
    "runners.notice.deleteFailed": "Runner {name} could not be deleted",
    "runners.restart.heading": "Restart {name}?",
    "runners.restart.text":
        "The container stops and starts again. A job that is running on it is aborted.",
    "runners.update.heading": "Update {name}?",
    "runners.update.text":
        "The container is recreated with image version {version}. A job that is running on it fails and is not retried automatically.",
    "runners.update.textPlain":
        "The container is recreated with the current image. A job that is running on it fails and is not retried automatically.",
    "runners.delete.heading": "Delete {name}?",
    "runners.delete.text.github":
        "Removes the container and its volumes, including the cache. A stack the extension created goes with its last runner, a stack you picked stays. A running job is cancelled. GitHub keeps listing the runner as offline until it removes it after 14 days; delete it earlier under `Settings` → `Actions` → `Runners`.",
    "runners.delete.text.gitlab":
        "Removes the runner from GitLab, the container and its volumes, including the cache. A stack the extension created goes with its last runner, a stack you picked stays. A running job is cancelled. If the container is already gone, the runner stays in GitLab; delete it there under `Settings` → `CI/CD` → `Runners`.",
    "runners.logs.heading": "Logs: {name}",
    "runners.logs.empty.heading": "No output yet",
    "runners.logs.empty.text":
        "The container is still starting. Follow is on, the view refreshes every 5 seconds.",
    "runners.logs.empty.textPaused":
        "The container is still starting. Turn Follow on to refresh the view every 5 seconds.",
    "runners.logs.tail": "Lines",
    "runners.logs.lines": "Last {lines} lines",
    "runners.logs.follow": "Follow",

    "provider.github": "GitHub Actions",
    "provider.gitlab": "GitLab CI",

    "feedback.heading": "Feedback and support",
    "feedback.text":
        "This extension is open source and lives on GitHub. Every report and every question helps.",
    "feedback.issue.heading": "Something broke?",
    "feedback.issue.text":
        "A runner that does not register, a wrong text, a missing feature: open an issue with the steps to reproduce.",
    "feedback.issue.link": "Open an issue",
    "feedback.question.heading": "A question?",
    "feedback.question.text":
        "Which size fits, how to reach a database from a job, what the cache does: ask in the discussions.",
    "feedback.question.link": "Start a discussion",
    "feedback.code.heading": "Want to see the code?",
    "feedback.code.text":
        "Extension, runner images and docs are in one repository under the MIT license. Pull requests welcome.",
    "feedback.code.link": "Open the repository",

    "status.running": "Running",
    "status.starting": "Starting",
    "status.creating": "Creating",
    "status.stopping": "Stopping",
    "status.stopped": "Stopped",
    "status.error": "Error",
    "status.missing": "Stack missing",
    "status.unknown": "Unknown",

    "form.create.button": "Create runner",
    "form.create.heading": "Create runner",
    "form.cancel": "Cancel",
    "form.configure.heading": "Settings: {name}",
    "form.configure.button": "Save",
    "form.configure.warning.heading": "The container is recreated",
    "form.configure.warning.text":
        "Saving recreates the container with the new settings. A job that is running on it fails and is not retried automatically. Turning the cache off deletes the cache volume and its cronjob.",
    "form.summary.heading": "Created in this project",
    "form.summary.stack.label": "Stack: CI Runner: {target}",
    "form.summary.stack.text":
        "One stack per repository, organization or instance. Created with the first runner, shared by the others.",
    "form.summary.stack.selected.label": "Stack: {name}",
    "form.summary.stack.selected.text":
        "The runner joins this stack and reaches its services by name. Deleting the runner leaves the stack untouched.",
    "form.summary.service.label": "Container: {service}",
    "form.summary.service.text": "Limited to {cpus} CPU and {memory} GB RAM.",
    "form.summary.dataVolume.label": "Volume: {service}-data",
    "form.summary.dataVolume.text.github":
        "Runner registration and work directory: checkouts, downloaded actions, tool cache of the setup actions.",
    "form.summary.dataVolume.text.gitlab":
        "Builds directory and the storage behind the cache: keyword in .gitlab-ci.yml.",
    "form.summary.cacheVolume.label": "Volume: {service}-cache",
    "form.summary.cacheVolume.text":
        "Package manager cache. Its usage shows separately in mStudio.",
    "form.summary.cronjob.label": "Cronjob: cache cleanup",
    "form.summary.cronjob.text":
        "Trims the cache volume to {size} GB every hour.",
    "form.summary.builder.label": "Container: builder",
    "form.summary.builder.text":
        "Runs the image builds of every runner in this stack. One more container in the stack, shared.",
    "form.section.cache": "Cache",
    "form.section.runner": "Runner",
    "form.section.resources": "Resources",
    "form.configCommand.parsed": "Registers at {target}, token {token}",
    "form.snippet.heading": "Use in your pipeline",
    "form.snippet.text.github":
        "Jobs reach this runner through its labels in runs-on.",
    "form.snippet.text.gitlab": "Jobs reach this runner through its tags.",
    "form.provider.question": "Which CI system?",
    "form.provider.github.text": "Repositories and organizations",
    "form.provider.gitlab.text": "gitlab.com or self-hosted",
    "form.provider.change": "Change CI system",
    "form.name.label": "Name",
    "form.name.description": "Used as the runner name in the CI system.",
    "form.name.required": "Name is required",
    "form.name.tooShort": "Name needs at least 2 characters",
    "form.name.tooLong": "Name can have 64 characters at most",
    "form.github.configCommand.label": "Setup command from GitHub",
    "form.github.configCommand.description":
        "Paste the config command from the New self-hosted runner page. Repository or organization and the registration token are read from it.",
    "form.github.configCommand.required": "Setup command is required",
    "form.github.configCommand.invalid":
        "Paste the full command with --url https://github.com/... and --token.",
    "form.github.runnerGroup.label": "Runner group",
    "form.gitlab.configCommand.label": "Register command from GitLab",
    "form.gitlab.configCommand.description":
        "Paste the gitlab-runner register command from the New runner page. Instance URL and runner token are read from it; tags and scope were set on that page.",
    "form.gitlab.configCommand.required": "Register command is required",
    "form.gitlab.configCommand.invalid":
        "Paste the full command with --url https://... and --token glrt-...",
    "form.labels.label": "Labels",
    "form.tags.label": "Tags",
    "form.labels.description":
        "Comma separated. Reference them with runs-on: [self-hosted, mittwald].",
    "form.stack.label": "Target stack",
    "form.stack.automatic": "Automatic (one stack per target)",
    "form.stack.option": "{name} ({services} services)",
    "form.stack.description":
        "Pick a stack when jobs need its services, for example a database for migrations. Stacks the extension created for runners are not listed.",
    "form.stack.help":
        "Containers of a stack reach each other by service name over the stack network. A runner in the stack of your application can run migrations or integration tests against its database. Without a choice the extension uses one stack per registration target and creates it with the first runner. A stack you pick here is never deleted by the extension; deleting the runner removes only its container.",
    "form.size.label": "Size",
    "form.size.description": "All jobs of this runner share these limits.",
    "form.size.small": "Small (0.5 CPU, 1 GB RAM)",
    "form.size.medium": "Medium (1 CPU, 2 GB RAM)",
    "form.size.large": "Large (2 CPU, 4 GB RAM)",
    "form.size.custom": "Custom",
    "form.size.customValue": "Custom ({cpus} CPU, {memory} GB RAM)",
    "form.cpus.label": "CPU limit",
    "form.cpus.description": "0.25 to 8 CPUs in steps of 0.25.",
    "form.cpus.required": "Enter a CPU limit",
    "form.cpus.range": "Enter a value between 0.25 and 8",
    "form.cpus.help":
        "Share of CPU cores the container may use. One job with npm or Composer uses one CPU well; scripts and deployments get by with less.",
    "form.memory.label": "Memory limit (GB)",
    "form.memory.description": "0.5 to 16 GB in steps of 0.5.",
    "form.memory.required": "Enter a memory limit",
    "form.memory.range": "Enter a value between 0.5 and 16",
    "form.memory.help":
        "Memory the container may use. A job that exceeds it is killed. Plan about 1 GB per job, more for test suites with a browser or a database.",

    "help.open": "Help for {subject}",
    "form.name.help":
        "Shown as the runner name in GitHub or GitLab and in this list. Letters, digits and hyphens are kept, every other character becomes a hyphen.",
    "form.github.configCommand.help":
        "On GitHub open the repository or organization, then `Settings` → `Actions` → `Runners` → `New self-hosted runner`. Under `Configure` copy the line starting with `./config.sh` (or `./config.cmd`) and paste it here. Only `--url` and `--token` are used. The token expires after one hour, so create the runner right away. After you delete the runner here, GitHub lists it as offline until it removes it after 14 days.",
    "form.github.runnerGroup.help":
        "Only for organizations. Runner groups control which repositories may use the runner. Leave empty for the group Default.",
    "form.gitlab.configCommand.help":
        "On GitLab open the project or group, then `Settings` → `CI/CD` → `Runners` → `New project runner`. Set tags and whether untagged jobs run, click `Create runner` and copy the `gitlab-runner register` line from step 1. Only `--url` and `--token` are used. The token belongs to that runner; deleting the runner here removes it from GitLab.",
    "form.labels.help":
        "Comma separated labels the runner registers with. Reference them in the workflow with runs-on: [self-hosted, mittwald]. Jobs whose labels do not match never reach this runner.",
    "form.cache.label": "Persistent cache for package managers",
    "form.cache.help":
        "Adds a cache volume at /home/runner/.cache and points npm, pnpm, yarn, pip, Composer and Go at it (XDG_CACHE_HOME plus the tool specific variables). Downloads from earlier jobs are reused, which speeds up installs. The volume survives jobs, restarts and updates. You can turn the cache on or off later in the runner settings; turning it off deletes the volume.",
    "form.cacheSize.label": "Cache limit (GB)",
    "form.cacheSize.description":
        "An hourly cronjob in the project deletes the oldest files above this limit.",
    "form.cacheSize.required": "Cache limit is required",
    "form.cacheSize.range": "Enter a value between 1 and 500 GB",
    "form.cacheSize.help":
        "mittwald volumes have no size limit of their own, so the extension creates a cronjob in the project that runs every hour inside the runner container. It deletes the least recently modified files until the cache fits the limit. The cronjob is removed with the runner.",
    "form.imageBuilds.label": "Image builds in jobs",
    "form.imageBuilds.help":
        "Lets jobs run docker build although the container has no Docker daemon. The build runs in a builder container of the same stack (kaniko) and the runner pushes the image with the credentials from docker login. The builder is added to the stack once and serves every runner in it. Without a layer cache, every build starts from the base image. BuildKit features such as RUN --mount, --secret, --ssh and builds for another architecture do not work; the docker command says so instead of building something else.",
    "form.concurrency.label": "Jobs at once",
    "form.concurrency.required": "Enter how many jobs run at once",
    "form.concurrency.range": "Enter a value between 1 and 8",
    "form.concurrency.help":
        "How many jobs the runner takes at the same time (concurrent in the GitLab Runner config). All jobs share the CPU and memory limits of the size, so a second job slows the first one down and a build that needs more memory than its share fails.",
    "form.concurrency.recommendation.small":
        "Small: 1 job. 0.5 CPU and 1 GB RAM fit one job.",
    "form.concurrency.recommendation.medium":
        "Medium: 1 job, 2 for scripts and deployments. Two builds with npm or Composer share 1 CPU and 2 GB RAM.",
    "form.concurrency.recommendation.large":
        "Large: 2 jobs, up to 4 for scripts and deployments. Four jobs share 2 CPUs and 4 GB RAM.",
    "form.concurrency.recommendation.custom":
        "Custom: about one job per CPU, and about 1 GB RAM per job.",
    "form.concurrency.github":
        "A GitHub runner takes one job at a time. Create several runners for parallel jobs.",
    "form.size.help":
        "CPU and memory limits of the runner container, counted against the container hosting resources of this project. Small fits scripts and deployments, medium builds with npm or composer, large parallel test suites.",

    "error.generic":
        "Something went wrong. Try again, or check the runner logs.",
    "error.fallback.heading": "Loading failed",
    "error.fallback.text": "Something went wrong here.",
    "error.fallback.retry": "Try again",
    "error.unexpected": "An unexpected error occurred",
    "error.permissions":
        "Insufficient permissions. Either you cannot manage containers in this project or the extension lacks a scope (stack:read, stack:write, stack:delete).",
    "error.instance.unknown":
        "This installation is not registered with the extension yet. Reinstall the extension in mStudio, then try again.",
    "error.notFound.runner": "The runner was not found.",
    "error.notFound.runnerContainer": "The runner container was not found.",
    "error.notFound.stack":
        "The selected stack cannot be used. Pick another one from the list.",
    "error.upstream.stackCreate":
        "The stack could not be created (status {status}).",
    "error.upstream.stackDeclare":
        "The runner container could not be declared (status {status}). {detail}",
    "error.upstream.imageMissing":
        "mittwald cannot pull the runner image {image}. The image must exist and be publicly readable. For GHCR, set the package visibility to public.",
    "error.upstream.logs": "Logs could not be loaded (status {status}).",
    "error.upstream.recreate":
        "mittwald could not recreate the runner container (status {status}). The container keeps running with its previous image and settings. Try again in a moment.",
    "error.upstream.stackDelete":
        "The stack could not be deleted (status {status}).",
    "error.upstream.stackGet":
        "The runner stack could not be loaded (status {status}). Try again in a moment.",
    "error.upstream.stackList":
        "The stacks of the project could not be loaded (status {status}). Try again in a moment.",
    "error.upstream.projectGet":
        "The project could not be loaded (status {status}). Try again in a moment.",
    "error.builder.nameTaken":
        "The stack already has a container called builder that this extension did not create. Image builds need that name. Rename your container or pick another stack.",
    "error.containerHosting.unavailable":
        "This project does not support Container Hosting, so it cannot run CI runners. Move the extension to a project on a server that offers Container Hosting.",
    "error.upstream.cronjobCreate":
        "mittwald could not create the cleanup cronjob for the cache (status {status}). The extension needs the cronjob scopes.",
    "error.upstream.cronjobUpdate":
        "mittwald could not update the cleanup cronjob for the cache (status {status}).",
    "error.gitlab.instanceUrlInvalid":
        "The GitLab URL must be a public https address.",
    "error.gitlab.runnerTokenInvalid":
        "GitLab does not accept the runner token. Paste the full register command from the New runner page; the token starts with glrt-.",
    "error.gitlab.status": "GitLab responded with status {status}.",
    "error.gitlab.removeFailed":
        "The GitLab runner could not be removed (status {status}).",
} as const;
