# Image builds

Pipelines that call `docker build` work on these runners, without a Docker daemon and
without privileges. The build runs in a second container of the same stack, the builder
service, which executes [kaniko](https://github.com/chainguard-forks/kaniko). The runner
sends the build context, receives the finished image as a tarball and pushes it with
[crane](https://github.com/google/go-containerregistry).

## Why it looks like this

Container Hosting runs containers without the privileges every daemonless builder
except kaniko needs. Measured inside a container of a project:

| Probe | Result |
|---|---|
| `unshare -U true` | works |
| `unshare -m true` | `Operation not permitted` |
| `echo "0 0 1" > /proc/self/uid_map` | `EPERM` |
| `chroot /r /bin/busybox echo ok` | `Operation not permitted` |
| `mknod /r/dev/null c 1 3` | `Operation not permitted` |

That rules out buildah, podman and rootless BuildKit: all of them re-exec into a user
namespace and need a uid map. kaniko needs neither, because it unpacks the base image
into the root filesystem of its own container and runs every `RUN` there.

The price is that the container is destroyed by its own build. Its `/usr/bin` belongs to
the built image afterwards, `cat` and `sleep` are gone. So a builder container serves
exactly one build and then exits. The service runs with `restartPolicy: always`, and the
platform replaces it within about a second, with a clean root filesystem.

## Building blocks

```
runner container                     builder container
  docker build                         /kaniko/loop.sh
  -> mstudio-build                       claims the job
  -> /builds/queue/<job>/  <--------->   runs kaniko
  <- image.tar, log, result              writes the tarball, exits
  -> crane push
```

Both containers mount the same directory of the project file system,
`/home/<project>/ci-builds/<stack id>` at `/builds`. That is the whole channel: no API
token in the job, no stack change per build, no log polling. The stack id is part of the
path because the file system belongs to the project, not to the stack: two stacks run two
builders, and on a shared path they would poll one queue and claim each other's jobs. The
queue directory below the mount is created by the builder with mode `1777`, because the
uid of the runner user depends on its base image and the API has no field for the user of
a container.

Protocol, one directory per job:

| Path | Written by | Content |
|---|---|---|
| `queue/<job>/context/` | runner | build context |
| `queue/<job>/build-args`, `labels` | runner | one `KEY=VALUE` per line |
| `queue/<job>/request` | runner | job parameters, written last, claims the job |
| `queue/<job>/log` | builder | kaniko output, streamed into the job log |
| `queue/<job>/image.tar` | builder | the built image |
| `queue/<job>/result` | builder | `exit=<code>`, written last |

The job directory belongs to the runner, so it can delete the whole job afterwards. The
builder never receives registry credentials: it writes a tarball, the push happens in the
runner with the credentials from `docker login`.

## Setting it up

Turn on *Image builds in jobs* when creating a runner or later in its settings. The
extension then mounts the build queue into the runner and declares the builder service
of the stack if it is missing:

```json
{
  "image": "ghcr.io/hermsi1337/mstudio-ci-builder:<version>",
  "restartPolicy": "always",
  "volumes": ["/home/<project>/ci-builds/<stack id>:/builds"],
  "deploy": { "resources": { "limits": { "cpus": "2", "memory": "4096mb" } } }
}
```

One builder serves every runner of its stack. Turning the switch off for the last runner
of that stack that builds removes it again, deleting that runner does the same. What stays
is the queue directory of the stack in the project file system; it is empty, because every
job removes its own directory when it is done. No new scope is
needed, the extension declares the service with `stack:write`. The image follows the
extension release like the runner images do (`BUILDER_IMAGE`,
[development.md](development.md)).

Environment of the builder:

| Variable | Meaning | Default |
|---|---|---|
| `BUILD_QUEUE_DIR` | shared directory | `/builds` |
| `BUILD_TIMEOUT` | seconds a single build may take | `3600` |

Environment of the runner:

| Variable | Meaning | Default |
|---|---|---|
| `BUILD_QUEUE_DIR` | shared directory | `/builds` |
| `MSTUDIO_IMAGE_STORE` | where built images are kept | `RUNNER_DATA_DIR/images` |
| `MSTUDIO_INSECURE_REGISTRIES` | comma separated hosts that speak plain HTTP | |
| `MSTUDIO_BUILD_TIMEOUT` | seconds the runner waits for the builder | `3600` |

## Using it

Existing pipelines need no change. `docker` in the runner is a shim
(`docker/runner/common/docker-shim`) that maps builds onto the builder and everything
registry related onto crane.

```yaml
# GitHub Actions
- uses: docker/login-action@v4
  with:
    registry: ghcr.io
    username: ${{ github.actor }}
    password: ${{ secrets.GITHUB_TOKEN }}
- uses: docker/build-push-action@v7
  with:
    push: true
    tags: ghcr.io/me/app:${{ github.sha }}
```

```yaml
# GitLab CI
build:
  tags: [mittwald]
  script:
    - docker login -u "$CI_REGISTRY_USER" -p "$CI_REGISTRY_PASSWORD" "$CI_REGISTRY"
    - docker build -t "$CI_REGISTRY_IMAGE:$CI_COMMIT_SHA" .
    - docker push "$CI_REGISTRY_IMAGE:$CI_COMMIT_SHA"
```

`mstudio-build` is the same thing without the docker vocabulary:

```bash
mstudio-build --push -t ghcr.io/me/app:1 --build-arg VERSION=1 .
```

## What the shim fills in

| Flag or command | Behaviour |
|---|---|
| `--iidfile` | image id (config digest); with `--push` the digest of the pushed manifest, like buildx |
| `--metadata-file` | `containerimage.config.digest`, `containerimage.digest` (only after a push), `image.name` |
| `docker images`, `docker inspect`, `docker tag`, `docker rmi` | served from the image store on the data volume |
| `docker push`, `docker pull`, `docker manifest inspect` | crane |
| `docker save`, `docker load` | copies the tarball in and out of the store |
| `docker login`, `docker logout` | `crane auth login`, writes the usual `~/.docker/config.json` |
| `docker buildx create/inspect/ls`, `docker context inspect/ls` | answer with one fixed builder, so `setup-buildx-action` runs through |
| `docker buildx use/stop/rm/prune` | does nothing and says so |
| `docker buildx imagetools inspect` | `crane manifest` |

## What it warns about

These flags are accepted so pipelines keep running, and every one of them prints a line
into the job log:

| Flag | Why it is ignored |
|---|---|
| `--no-cache`, `--pull` | the builder has no layer cache and always pulls the base image |
| `--cache-from`, `--cache-to` | no layer cache, see below |
| `--provenance`, `--sbom`, `--attest`, `--annotation` | the builder writes no attestations |
| `--load` | there is no daemon to load into, the image stays in the image store |

## What it refuses

Failing early with a clear message beats a build that silently does something else.

| Input | Message |
|---|---|
| `--secret`, `--ssh`, `--build-context` | BuildKit features the builder cannot provide |
| `--platform` with a foreign or multiple platforms | kaniko cannot emulate another architecture |
| `RUN --mount=...`, `--network=`, `--security=` in the Dockerfile | checked before the job is queued |
| `--output` other than `type=registry`, `push=true` or `type=docker,dest=` | no equivalent |
| `docker run`, `exec`, `compose`, `ps`, `network`, `volume`, `commit` | need a daemon |
| `docker buildx bake` | not supported, call `docker build` per image |

`COPY --link` and here-documents in `RUN` produce a warning: kaniko ignores the first and
is untested with the second.

## Limits

- **No layer cache.** kaniko can cache layers in a registry (`--cache-repo`), which fills
  the registry of the user with cache tags. Every build starts from the base image.
- **One build at a time per stack.** The builder claims one job, builds it and exits.
  Parallel jobs queue up, each build waits for the container to come back.
- **One architecture.** The builder builds for the architecture it runs on.
- **No attestations, no SBOM.**

## Troubleshooting

`image builds are turned off for this stack` means `/builds/queue` does not exist: the
builder service is missing from the stack or does not run.

`the builder did not finish within 3600s` means the job was never claimed. Check the logs
of the builder service in mStudio.

Between two builds the builder service shows `error` with the message
`Container terminated with exit code 0`. That is the platform describing a container that
has ended; the restart follows within about a second.

A container that exits again and again gets a restart backoff (1 s, 13 s, 28 s, 50 s).
Only a builder that crashes on start hits this, because a builder that waits for jobs
runs long enough to reset it.
