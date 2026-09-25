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
| `lsetxattr security.capability` (no `CAP_SETFCAP`) | `Operation not permitted` |

That rules out buildah, podman and rootless BuildKit: all of them re-exec into a user
namespace and need a uid map. kaniko needs neither, because it unpacks the base image
into the root filesystem of its own container and runs every `RUN` there.

The price is that the container is destroyed by its own build. Its `/usr/bin` belongs to
the built image afterwards, `cat` and `sleep` are gone. So a builder container serves
exactly one build and then exits. The service runs with `restartPolicy: always`, and the
platform replaces it within about a second, with a clean root filesystem.

Files that the builder image has and the base image does not have survive the unpack.
The builder image is Alpine, and Alpine ships `/etc/sysctl.conf`. Debian's `procps`
installs the same path as a conffile, so dpkg finds an unknown file there, asks what to
do, reads EOF from stdin and fails the `apt-get install`. `DEBIAN_FRONTEND` does not
help, it steers debconf, not dpkg. `docker/builder/Dockerfile` therefore deletes
`/etc/sysctl.conf`, and as a precaution `/etc/inittab`, `/etc/modules` and
`/etc/securetty`, which are Alpine only as well. The remaining Alpine only files under
`/etc` (terminfo, apk keys, `profile.d`) have not collided with a package so far.

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
| `queue/<job>/request` | runner | job parameters, written last, offers the job |
| `queue/<job>/request.claimed` | builder | the same file renamed, which is how one builder takes a job |
| `queue/<job>/log` | builder | kaniko output, streamed into the job log |
| `queue/<job>/image.tar` | builder | the built image |
| `queue/<job>/exit-code`, `queue/<job>/result` | builder | exit code of kaniko, `result` written last and polled by the runner |

The job directory belongs to the runner, which deletes it once a result is in. A job that
was abandoned, because the runner was killed or the builder died while building, stays
behind; the builder deletes such directories when they are older than `BUILD_MAX_AGE`.
Nothing offers a claimed job a second time. When a builder is replaced while it builds, it
leaves its job claimed without a result; the next builder writes a failing result for such
jobs on startup, so the runner fails the build in seconds instead of waiting for its whole
timeout. The build has to be started again.

The builder never receives registry credentials: it writes a tarball, the push happens in
the runner with the credentials from `docker login`.

Every runner of a stack writes into the same queue, and every job in those runners is root
in its own container. A job can therefore read the build context of a job that runs at the
same time in another runner of that stack, and it can change an image tarball before its
runner pushes it. That is the same boundary as the rest of the runner
([architecture.md](architecture.md#trust-model-of-a-runner)): one stack per trust
boundary, and no untrusted pull requests.

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

One builder serves every runner of its stack. Updating a runner also brings the builder
to the image of the release, because both ship together. Turning the switch off for the
last runner of that stack that builds removes it again, deleting that runner does the
same. What stays
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
| `BUILD_HEARTBEAT` | seconds between "idle" lines in the log | `300` |
| `BUILD_MAX_AGE` | hours after which a leftover job directory is deleted | `24` |

Environment of the runner. The extension sets none of them, the defaults work; change one
by editing the service in mStudio or by exporting it in the job:

| Variable | Meaning | Default |
|---|---|---|
| `BUILD_QUEUE_DIR` | shared directory | `/builds` |
| `MSTUDIO_IMAGE_STORE` | where built images are kept | `RUNNER_DATA_DIR/images` |
| `MSTUDIO_INSECURE_REGISTRIES` | comma separated hosts that speak plain HTTP, for a registry inside the project | |
| `MSTUDIO_BUILD_TIMEOUT` | seconds the runner waits for a result, a little above `BUILD_TIMEOUT` so it never gives up on a build that still runs | `3900` |

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
| `docker save`, `docker load` | copies the tarball in and out of the store. `docker load` needs `-i <file>`, it does not read from a pipe |
| `docker login`, `docker logout` | `crane auth login`, writes the usual `~/.docker/config.json` |
| `docker buildx create/inspect/ls`, `docker context inspect/ls` | answer with one fixed builder, so `setup-buildx-action` runs through |
| `docker version`, `docker buildx version` | report a docker version and buildx `v0.12.1`, which the docker actions parse before they do anything |
| `docker buildx` without a subcommand | prints its subcommands and exits 0, which is how `docker/build-push-action` probes for buildx |
| `docker buildx use/stop/rm/prune/du`, `docker context use/create/rm` | does nothing and says so |
| `docker builder` | the same as `docker buildx` |
| `docker info` | one line about the shim, enough for the actions that print it |
| `docker buildx imagetools inspect` | `crane manifest` |

### Why buildx 0.12.1

The reported buildx version decides how much the docker actions do on their own. From
0.13 on, `docker/build-push-action` exports a build record with `docker buildx history`
after every build and waits for the answer; there are no build records here, so the post
step of the action hung until the job was killed. Reporting 0.12.1 keeps those actions on
the plain build path. `docker buildx history` is answered quietly anyway, in case
something asks.

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
- **File capabilities stay in the base image only.** Some base images give binaries a
  capability, `caddy` for example carries `cap_net_bind_service` on `/usr/bin/caddy`. The
  builder cannot set it while unpacking, because the container lacks `CAP_SETFCAP` and the
  API cannot add it. Upstream kaniko aborts there. The builder patches kaniko
  (`docker/builder/patches/`) to print a warning and go on. The file keeps its capability
  in the base image layer, so the built image works. A file that a later step changes or
  copies (`COPY --from=` a stage with such a base image) loses it.
- **Base images come from public registries.** The builder has no credentials and no
  `--insecure-pull`, so `FROM` a private registry or a registry inside the project fails
  while pushing to the same registry works.
- **Images stay on the data volume.** Every build leaves its tarball in the image store.
  `docker rmi` deletes the tarball with its last reference, `docker image prune` deletes
  everything nothing points at any more.

## What the builder logs

The builder writes into the log of its service in mStudio, which is the place to look
when a build behaves oddly:

```
[builder] ready, watching /builds/queue, one build per container, timeout 3600s
[builder] idle, queue empty for 300s
[builder] claimed build-1789578335-178
[builder] build-1789578335-178: destination=ghcr.io/me/app:1 dockerfile=Dockerfile
[builder] build-1789578335-178: context 1.2M, 34 files
[builder] build-1789578335-178: running kaniko, output goes to the job log and to the runner
[builder] build-1789578335-178: exit=0 after 7s, replacing this container
```

The kaniko output itself goes to both places: into the job log of the pipeline and into
the container log.

## Troubleshooting

`image builds are turned off for this stack` means `/builds/queue` does not exist: the
builder service is missing from the stack or does not run.

`the builder did not finish within 3600s` means no result arrived and no builder claimed
the job at all: the builder service is missing or not running. A build whose builder died
mid build no longer waits for this timeout, the next builder fails it on startup with
`the build container was replaced before the build finished`. The log of the builder
service in mStudio shows what happened.

`/builds/queue is not writable by runner` means the builder never started: it is the
service that creates the directory and makes it writable.

`The stack already has a container called builder` means the stack you picked has a
service of that name that this extension did not create. The extension does not touch it,
because declaring over it would replace the image and removing it later would delete its
volumes. Rename it or pick another stack.

Between two builds the builder service shows `error` with the message
`Container terminated with exit code 0`. That is the platform describing a container that
has ended; the restart follows within about a second.

A container that exits again and again gets a restart backoff (1 s, 13 s, 28 s, 50 s).
Only a builder that crashes on start hits this, because a builder that waits for jobs
runs long enough to reset it.

A build that never starts although the runner sent it: compare the queue directory of the
runner with the one of the builder. Both mount `ci-builds/<stack id>`, so a runner that
was created before the stack got its own directory would write somewhere else.
