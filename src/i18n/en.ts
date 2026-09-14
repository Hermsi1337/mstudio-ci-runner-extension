export const en = {
    "app.title": "CI Runners",
    "app.dockerNotice.title": "No Docker inside runners",
    "app.dockerNotice.text":
        "Runners run on mittwald Container Hosting without a Docker daemon.\n\n**Fails**\n\n- GitHub Actions: `container:`, `services:`, `docker build`, Docker container actions\n- GitLab CI: `image:`, `services:`, anything that calls `docker`\n\n**Works**\n\n- Jobs that run directly on Ubuntu 24.04: Node via `actions/setup-node`, Python, `build-essential`\n- `git`, `curl`, `rsync`, SSH deploys\n- Installing packages with `sudo apt-get`",

    "local.heading": "Local mode",
    "local.text":
        "This page runs outside mStudio. Requests use LOCAL_API_TOKEN against the project LOCAL_PROJECT_ID. Not available in production.",

    "runners.heading": "Runners",
    "runners.intro":
        "Each runner is its own container stack in this project and registers itself with GitHub or GitLab on start. Deleting a runner removes its registration.",
    "runners.empty.heading": "No runners yet",
    "runners.empty.text":
        'Use "Create runner" to add the first CI runner to this project.',
    "runners.column.name": "Name",
    "runners.column.provider": "CI system",
    "runners.column.target": "Target",
    "runners.column.labels": "Labels",
    "runners.column.size": "Size",
    "runners.column.cache": "Cache",
    "runners.column.version": "Runner version",
    "runners.column.status": "Status",
    "runners.column.actions": "Actions",
    "runners.action.logs": "Logs",
    "runners.action.restart": "Restart",
    "runners.action.update": "Update",
    "runners.action.configure": "Settings",
    "runners.action.delete": "Delete",
    "runners.version.unknown": "unknown",
    "runners.version.updateAvailable": "Update to {version}",
    "runners.ephemeralSuffix": "(ephemeral)",
    "runners.cache.off": "off",
    "runners.cache.limit": "{size} GB",
    "runners.logs.heading": "Logs: {name}",
    "runners.logs.empty": "(no logs yet)",

    "provider.github": "GitHub Actions",
    "provider.gitlab": "GitLab CI",

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
    "form.configure.text":
        "Changing the cache redeclares the stack and mittwald recreates the container. A running job is cancelled. Turning the cache off deletes the tool-cache volume and its cronjob.",
    "form.summary.heading": "Created in this project",
    "form.summary.stack":
        "Container stack CI Runner ({provider}): {name} with the service runner",
    "form.summary.dataVolume.github":
        "Volume runner-data: runner registration and work directory (checkouts, downloaded actions, tool cache of setup actions)",
    "form.summary.dataVolume.gitlab":
        "Volume runner-data: builds directory and the directory for the cache: keyword of GitLab CI",
    "form.summary.cacheVolume":
        "Volume tool-cache: package manager cache, shown separately in mStudio",
    "form.summary.cronjob":
        "Cronjob: trims the tool-cache volume to {size} GB every hour",
    "form.provider.label": "CI system",
    "form.name.label": "Name",
    "form.name.description": "Used as the runner name in the CI system.",
    "form.name.required": "Name is required",
    "form.github.target.label": "GitHub organization or repository",
    "form.github.target.placeholder": "owner or owner/repo",
    "form.github.target.description":
        "Organization (for example my-org) or repository (for example my-org/my-repo).",
    "form.github.target.required": "Organization or repository is required",
    "form.github.tokenType.label": "Authentication",
    "form.github.tokenType.registration": "Registration token from GitHub",
    "form.github.tokenType.pat": "Personal access token (PAT)",
    "form.github.configCommand.label": "Setup command from GitHub",
    "form.github.configCommand.description":
        "Paste the config command from the New self-hosted runner page. Repository or organization and the registration token are read from it.",
    "form.github.configCommand.required": "Setup command is required",
    "form.github.configCommand.invalid":
        "Paste the full command with --url https://github.com/... and --token.",
    "form.github.token.label": "GitHub token (PAT)",
    "form.github.token.description":
        'Fine-grained PAT with "Administration: Read and write" (repository) or "Self-hosted runners: Read and write" (organization). Stored encrypted and passed to the container as an environment variable.',
    "form.github.token.required": "GitHub token is required",
    "form.github.runnerGroup.label": "Runner group",
    "form.github.ephemeral.label": "Ephemeral (fresh registration per job)",
    "form.gitlab.instanceUrl.label": "GitLab instance",
    "form.gitlab.instanceUrl.description":
        "https://gitlab.com or the URL of your own instance.",
    "form.gitlab.instanceUrl.required": "GitLab URL is required",
    "form.gitlab.runnerType.label": "Runner type",
    "form.gitlab.runnerType.project": "Project",
    "form.gitlab.runnerType.group": "Group",
    "form.gitlab.runnerType.instance": "Instance (admin)",
    "form.gitlab.projectPath.label": "Project path",
    "form.gitlab.groupPath.label": "Group path",
    "form.gitlab.path.placeholder": "group/project",
    "form.gitlab.path.required": "Path is required",
    "form.gitlab.token.label": "GitLab token (PAT)",
    "form.gitlab.token.description":
        "Personal access token with the scopes create_runner and api. Only used to create the runner; the container receives the runner token only.",
    "form.gitlab.token.required": "GitLab token is required",
    "form.gitlab.runUntagged.label": "Also run jobs without tags",
    "form.labels.label": "Labels",
    "form.tags.label": "Tags",
    "form.labels.description":
        "Comma separated. GitHub: runs-on: [self-hosted, mittwald], GitLab: tags: [mittwald].",
    "form.size.label": "Size",
    "form.size.small": "Small (0.5 CPU, 1 GB RAM)",
    "form.size.medium": "Medium (1 CPU, 2 GB RAM)",
    "form.size.large": "Large (2 CPU, 4 GB RAM)",

    "help.open": "Help for {subject}",
    "form.provider.help":
        "Choose where the runner registers. GitHub Actions runners appear under Settings, Actions, Runners of the repository or organization. GitLab CI runners appear under Settings, CI/CD, Runners of the project or group.",
    "form.name.help":
        "Shown as the runner name in GitHub or GitLab and in this list. Letters, digits and hyphens are kept, every other character becomes a hyphen.",
    "form.github.target.help":
        "For an organization enter its name, for example my-org. For a single repository enter owner/repo, for example my-org/my-repo. An organization runner serves every repository its runner group allows.",
    "form.github.tokenType.help":
        "Registration token: open the runner settings of the repository or organization on GitHub, click New self-hosted runner and copy the token from the config command. The token expires after one hour, so the runner registers once and stores the resulting credentials (a few small files) in the runner-data volume of its stack. Restarts and updates reuse them without a new token. No PAT is stored. Ephemeral runners are not possible because every job would need a fresh registration.\nPersonal access token: the container fetches registration and removal tokens itself on every start, so it needs no stored registration. Needed for ephemeral runners. The PAT is stored encrypted and lives in the container.",
    "form.github.configCommand.help":
        "On GitHub open the repository or organization, then Settings, Actions, Runners, New self-hosted runner. Under Configure copy the line starting with ./config.sh (or ./config.cmd) and paste it here. Only --url and --token are used. The token expires after one hour, so create the runner right away. When you delete the runner it deregisters as long as the token is valid; otherwise GitHub removes the offline runner after 14 days.",
    "form.github.token.help":
        "The runner registers with a personal access token. Create a fine-grained token on GitHub under Settings, Developer settings, Personal access tokens. Repository: permission Administration, read and write. Organization: permission Self-hosted runners, read and write.\nThe token is stored encrypted and handed to the runner container, which fetches a registration token with it on every start. Members with access to the container can read it, so keep its scope small.",
    "form.github.token.link": "Create a fine-grained token on GitHub",
    "form.github.runnerGroup.help":
        "Only for organizations. Runner groups control which repositories may use the runner. Leave empty for the group Default.",
    "form.github.ephemeral.help":
        "An ephemeral runner takes exactly one job, deregisters and registers again with a clean work directory. Safer for untrusted code, slower per job because every job starts on a fresh registration.",
    "form.gitlab.instanceUrl.help":
        "https://gitlab.com for the hosted service, or the base URL of your self-managed instance, for example https://gitlab.example.com.",
    "form.gitlab.runnerType.help":
        "Project: serves one project, you need the maintainer role. Group: serves every project of a group, you need the owner role. Instance: serves the whole instance, you need to be an administrator.",
    "form.gitlab.path.help":
        "The path as shown in the URL of the project or group, for example my-group/my-project or my-group/sub-group.",
    "form.gitlab.token.help":
        "Create a personal access token under User settings, Access tokens with the scopes create_runner and api. The token is used once to register the runner and is not stored. The container only receives the runner token.",
    "form.gitlab.token.link": "Create a token on GitLab",
    "form.gitlab.runUntagged.help":
        "Enabled: the runner also picks up jobs that specify no tags. Disabled: only jobs that list one of the runner's tags run here.",
    "form.labels.help":
        "Comma separated labels the runner registers with. Reference them in the workflow with runs-on: [self-hosted, mittwald]. Jobs whose labels do not match never reach this runner.",
    "form.tags.help":
        "Comma separated tags the runner registers with. Reference them in the pipeline with tags: [mittwald]. Jobs whose tags do not match never reach this runner unless untagged jobs are allowed.",
    "form.cache.label": "Persistent cache for package managers",
    "form.cache.help":
        "Adds the volume tool-cache at /home/runner/.cache and points npm, pnpm, yarn, pip, Composer and Go at it (XDG_CACHE_HOME plus the tool specific variables). Downloads from earlier jobs are reused, which speeds up installs. The volume survives jobs, restarts and updates. You can turn the cache on or off later in the runner settings; turning it off deletes the volume.",
    "form.cacheSize.label": "Cache limit (GB)",
    "form.cacheSize.description":
        "An hourly cronjob in the project deletes the oldest files above this limit.",
    "form.cacheSize.required": "Cache limit is required",
    "form.cacheSize.range": "Enter a value between 1 and 500 GB",
    "form.cacheSize.help":
        "mittwald volumes have no size limit of their own, so the extension creates a cronjob in the project that runs every hour inside the runner container. It deletes the least recently modified files until the cache fits the limit. The cronjob is removed with the runner.",
    "form.size.help":
        "CPU and memory limits of the runner container, counted against the container hosting resources of this project. Small fits scripts and deployments, medium builds with npm or composer, large parallel test suites.",

    "error.generic": "Something went wrong",
    "error.fallback.heading": "Oops.",
    "error.fallback.text": "Something went wrong here.",
    "error.fallback.retry": "Try again",
    "error.unexpected": "An unexpected error occurred",
    "error.permissions":
        "Insufficient permissions. Either you cannot manage containers in this project or the extension lacks a scope (stack:read, stack:write, stack:delete).",
    "error.notFound.runner": "The runner was not found.",
    "error.notFound.runnerContainer": "The runner container was not found.",
    "error.upstream.stackCreate":
        "The stack could not be created (status {status}).",
    "error.upstream.stackDeclare":
        "The runner container could not be declared (status {status}).",
    "error.upstream.logs": "Logs could not be loaded (status {status}).",
    "error.upstream.stackDelete":
        "The stack could not be deleted (status {status}).",
    "error.upstream.cronjobCreate":
        "mittwald could not create the cleanup cronjob for the cache (status {status}). The extension needs the cronjob scopes.",
    "error.upstream.cronjobUpdate":
        "mittwald could not update the cleanup cronjob for the cache (status {status}).",
    "error.github.unreachable": "GitHub is unreachable: {reason}",
    "error.github.tokenInvalid": "The GitHub token is invalid.",
    "error.github.noAccessRepo":
        'The token cannot manage runners for repository {owner}/{repo}, or the repository does not exist. Fine-grained PAT: "Administration: Read and write".',
    "error.github.noAccessOrg":
        'The token cannot manage runners for organization {org}, or the organization does not exist. Fine-grained PAT: "Self-hosted runners: Read and write".',
    "error.github.status": "GitHub responded with status {status}.",
    "error.github.ephemeralNeedsPat":
        "Ephemeral runners need a personal access token. A registration token expires after one hour and cannot re-register the runner.",
    "error.gitlab.tokenInvalid": "The GitLab token is invalid.",
    "error.gitlab.noAccessProject":
        "The token cannot manage project {path}. Required scopes: create_runner and api (maintainer).",
    "error.gitlab.noAccessGroup":
        "The token cannot manage group {path}. Required scopes: create_runner and api (owner).",
    "error.gitlab.noAccessRunner":
        "The token cannot create runners. Required scopes: create_runner and api.",
    "error.gitlab.projectNotFound": "Project {path} was not found.",
    "error.gitlab.groupNotFound": "Group {path} was not found.",
    "error.gitlab.status": "GitLab responded with status {status}.",
    "error.gitlab.projectPathRequired":
        "Project path is required (for example group/project).",
    "error.gitlab.groupPathRequired": "Group path is required.",
    "error.gitlab.removeFailed":
        "The GitLab runner could not be removed (status {status}).",
} as const;
