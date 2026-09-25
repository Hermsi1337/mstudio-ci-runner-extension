# mStudio setup

## Becoming a contributor

In mStudio under *Organization → Development*, express interest in contributing.
Extensions can be created afterwards. Unverified extensions can only be installed in
your own organization, which is enough for development and self-hosting.
Details: [mittwald developer portal, contributor](https://developer.mittwald.de/en/docs/v2/contribution/overview/contributor/).

## Creating the extension

| Field | Value |
|---|---|
| Context | **Project** (stacks belong to a project) |
| Scopes | `project:read`, `stack:read`, `stack:write`, `stack:delete`, `cronjob:write`, `cronjob:delete` |
| Webhooks (all four) | `https://<extension-host>/api/webhooks/mittwald` |
| Frontend fragment | Anchor `/projects/project/menu/section/extensions/item`, URL `https://<extension-host>/` |
| Logo | `src/assets/logo.png` (512 px, rendered from `logo.svg`) |

`project:read` is what the extension reads the supported features of the project with.
Without the `container` feature it offers no runner and says so
([architecture.md](architecture.md#data-flow-create-runner)).

There are no `container:*` scopes. The container endpoints are named `container-*`,
the scope is called `stack`; `stack:delete` also covers deleting the cache volume when
the cache is turned off. The cronjob scopes cover the cache cleanup cronjob the
extension creates, updates and deletes per runner with a cache limit
([providers.md](providers.md#package-manager-cache)).
Adding scopes to an existing extension requires every installed instance to consent
again.

*Docker in jobs* needs no new scope. The service `docker` works with access tokens of
the extension instance, which the extension issues through `POST
/api/docker-api/token` ([docker-api.md](docker-api.md#tokens)). With them it reads the
project, declares and removes services and volumes in its stack and looks up image
configurations (`GET /v2/container-image-config`). The API documentation names no
scope for the image lookup; if an installation answers it with 403, `docker run` and
Testcontainers fail on every image and the adapter log of the service shows the
status.

After creation:

1. Generate the extension secret → `EXTENSION_SECRET`.
2. Extension id → `EXTENSION_ID`.
3. Put both into the GitHub environment `mstudio` for the hosted extension
   ([operations.md](operations.md#deployment-to-mittwald-container-hosting)) or locally
   into `.env` ([development.md](development.md)).

## Second extension for development

Parts of the extension only show their real behaviour inside mStudio, so there is a
second registration that every release is deployed into before production
([operations.md](operations.md#deployment-to-mittwald-container-hosting)). It is created
exactly like the one above, with its own project, its own stack, its own domain and its
own secret, and its ids go into the GitHub environment `mstudio-dev`. Both entries sit in
the same organization, so the development one carries the suffix `(DEV)` in its name,
which `deploy-dev.yml` passes to `extension:sync` as `EXTENSION_NAME_SUFFIX`. Install it
in a project of your own, never publish it.

## Tokens

### GitHub

Default: the setup command from GitHub. Open *Settings → Actions → Runners → New
self-hosted runner* for the repository or organization and paste the
`./config.sh --url ... --token ...` line into the form; it reads target and registration
token from it. The token expires after one hour and is used once; the container keeps
the registration in the data volume. No PAT is involved.

Ephemeral runners and the PAT mode are disabled, see
[providers.md](providers.md#existing-providers).

### GitLab

The register command from GitLab. Create the runner under *Settings → CI/CD → Runners →
New project runner* (or group or instance runner), set tags there and paste the
`gitlab-runner register --url ... --token glrt-...` line from the next page into the
form. The token goes into the runner container only; deleting the runner reads it from
there. No PAT is involved.

The PAT mode is disabled, see [providers.md](providers.md#existing-providers).

### Docker in jobs

The service `docker` of a stack holds a random secret of that stack
(`DOCKER_API_SECRET`, the database keeps its SHA-256) and trades it at `PUBLIC_URL` for short-lived instance tokens.
No user token and no extension secret reach a container. Details in
[docker-api.md](docker-api.md#tokens).

## Marketplace entry and frontend fragment

Name, tags, support address, subtitle, descriptions, logo, fragment icon and fragment
title live in `deploy/mstudio/extension.yaml`. The extension form in mStudio offers some
of them and the fragment properties not at all, so the repository is the source and the
deployment writes them back ([operations.md](operations.md#deployment-to-mittwald-container-hosting)).

Manually:

```bash
MITTWALD_API_TOKEN=... MITTWALD_CONTRIBUTOR_ID=... MITTWALD_EXTENSION_ID=... \
  pnpm run extension:sync
```

What the script does not touch: scopes and webhook URLs. A new scope makes every
installation consent again, and the webhook URL belongs to the deployment, not to the
repository.

Notes on the fields:

- `description` exists once in the API without a language. The script sends the German
  text, the English one stays in the file for the marketplace form.
- `subTitle` is limited to 40 characters per language.
- The fragment `title` currently supports German only.
- The fragment URL stays as registered in mStudio; the script only writes icon and title
  into every fragment it finds.
- The icon is monochrome and uses `currentColor`, so it follows the menu color in both
  themes.

The list of anchors lives in mStudio under *Development* at the extension, not in the
documentation ([anchor reference](https://developer.mittwald.de/docs/v2/contribution/reference/frontend-fragment-anchors/)).
The project menu is `/projects/project/menu/section/extensions/item`.

## Testing a local extension

Webhooks require a public URL, see zrok in [development.md](development.md). Point the
frontend fragment of the development extension at `http://localhost:3000/`.
