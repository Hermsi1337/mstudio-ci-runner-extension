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
| Frontend fragment | Anchor *project menu* (or the anchor of your choice), URL `https://<extension-host>/` |
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

After creation:

1. Generate the extension secret → `EXTENSION_SECRET`.
2. Extension id → `EXTENSION_ID`.
3. Put both into the GitHub environment `mstudio` for the hosted extension
   ([operations.md](operations.md#deployment-to-mittwald-container-hosting)) or locally
   into `.env` ([development.md](development.md)).

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

## Icon of the frontend fragment

The fragment icon is not part of the extension form in mStudio. It is set through the
API: upload the icon as a file of the type `anchorIcon`, then write the file reference
into `frontendFragments.<anchor>.additionalProperties` with
`PATCH /v2/contributors/{contributorId}/extensions/{extensionId}`. The API documents
`additionalProperties` as "some information needed for the mStudio like the icon" but
does not name the key, so ask mittwald for it before setting the icon.

## Testing a local extension

Webhooks require a public URL, see zrok in [development.md](development.md). Point the
frontend fragment of the development extension at `http://localhost:3000/`.
