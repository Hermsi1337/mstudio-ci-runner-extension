export const en = {
    "app.title": "CI Runners",
    "app.dockerNotice.title": "No Docker inside runners",
    "app.dockerNotice.text":
        "Runners run on mittwald Container Hosting without a Docker daemon. GitHub workflows using container:, services: or docker build and GitLab jobs relying on image: will fail. Plain jobs (Node, PHP, Composer, Python, rsync, SSH deploys) work fine.",

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
    "runners.column.status": "Status",
    "runners.column.actions": "Actions",
    "runners.action.logs": "Logs",
    "runners.action.restart": "Restart",
    "runners.action.delete": "Delete",
    "runners.ephemeralSuffix": "(ephemeral)",
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
    "form.provider.label": "CI system",
    "form.name.label": "Name",
    "form.name.description": "Used as the runner name in the CI system.",
    "form.name.required": "Name is required",
    "form.github.target.label": "GitHub organization or repository",
    "form.github.target.placeholder": "owner or owner/repo",
    "form.github.target.description":
        "Organization (for example my-org) or repository (for example my-org/my-repo).",
    "form.github.target.required": "Organization or repository is required",
    "form.github.token.label": "GitHub token (PAT)",
    "form.github.token.description":
        'Fine-grained PAT with "Administration: Read and write" (repository) or "Self-hosted runners: Read and write" (organization). Stored encrypted and passed to the container as an environment variable.',
    "form.github.token.required": "GitHub token is required",
    "form.github.runnerGroup.label": "Runner group (optional)",
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
    "error.github.unreachable": "GitHub is unreachable: {reason}",
    "error.github.tokenInvalid": "The GitHub token is invalid.",
    "error.github.noAccessRepo":
        'The token cannot manage runners for repository {owner}/{repo}, or the repository does not exist. Fine-grained PAT: "Administration: Read and write".',
    "error.github.noAccessOrg":
        'The token cannot manage runners for organization {org}, or the organization does not exist. Fine-grained PAT: "Self-hosted runners: Read and write".',
    "error.github.status": "GitHub responded with status {status}.",
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
