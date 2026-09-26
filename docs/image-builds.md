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
| `unshare -Ur` as root (maps container uid 0) | `write failed /proc/self/uid_map: Operation not permitted` |
| user and mount namespace owned by uid 1001, own `binfmt_misc`, qemu registered | works, an arm64 binary runs |
| `chroot /r /bin/busybox echo ok` | `Operation not permitted` |
| `mknod /r/dev/null c 1 3` | `Operation not permitted` |
| `lsetxattr security.capability` (no `CAP_SETFCAP`) | `Operation not permitted` |

That rules out buildah, podman and rootless BuildKit: all of them re-exec into a user
namespace whose map includes container uid 0, and since Linux 5.12 such a map needs
`CAP_SETFCAP`. kaniko needs no namespace, because it can unpack the base image into the root
filesystem of its own container and run every `RUN` there. A namespace that leaves
container uid 0 unmapped works, and that is where the builder runs every build when the
kernel allows it ([below](#builds-for-the-other-architecture)). The root filesystem of
the container is the fallback.

On that fallback the container is destroyed by its own build. Its `/usr/bin` belongs to
the built image afterwards, `cat` and `sleep` are gone. So a builder container serves
exactly one build and then exits. The service runs with `restartPolicy: always`, and the
platform replaces it within about a second, with a clean root filesystem.

Files that the builder image has and the base image does not have survive the unpack on
the fallback path.
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
| `queue/<job>/request` | runner | job parameters (`DOCKERFILE`, `DESTINATION`, `TARGET`, `PLATFORM`), written last, offers the job |
| `queue/<job>/request.claimed` | builder | the same file renamed, which is how one builder takes a job |
| `queue/<job>/request.withdrawn` | runner | the same file renamed when the runner gives up before a builder claimed the job, so no builder picks it up later |
| `queue/<job>/log` | builder | kaniko output, streamed into the job log |
| `queue/<job>/image.tar` | builder | the built image |
| `queue/<job>/exit-code`, `queue/<job>/result` | builder | exit code of kaniko, `result` written last and polled by the runner |
| `builder.env` | builder | `PLATFORMS` and `EMULATION` from the startup probe, read by the shim and by `mstudio-build` |

The job directory belongs to the runner, which deletes it once a result is in. When the
runner gives up (`MSTUDIO_BUILD_TIMEOUT`) on a job that no builder claimed, it takes the
job back and deletes it. A job that was abandoned, because the runner was killed or the
builder died while building, stays behind; the builder deletes such directories when they
are older than `BUILD_MAX_AGE`.
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

### How a push moves the tags

A registry has no transaction across tags, so a push with several `-t` cannot be atomic.
`mstudio-build --push` keeps the part that can fail halfway away from the tags:

1. **Upload.** Every image goes to every repository among the tags by digest
   (`crane push image.tar <repository>@sha256:...`), one image per platform. Large
   layers, credentials that only cover some repositories and quotas fail here, and no
   tag has moved yet.
2. **Index.** With several platforms, `mstudio-build` writes the index itself with `jq`
   and puts it into every repository by digest with `crane edit manifest`. The children
   are the same everywhere, so the index and its digest are too. `crane index append`
   cannot do this step: it only writes to a tag and rejects a digest reference it cannot
   know in advance.
3. **Tags.** `mstudio-build` reads what each tag points at with `crane digest`, then sets
   one tag after the other with `crane tag <repository>@<digest> <tag>`. Each is one small
   manifest PUT.

When a tag PUT fails, the tags set before it go back to the digest they had. A tag that did
not exist before stays at the new image, because a registry offers no way to delete only
a tag. The log names every tag with its state (`points at ... again`, `did not exist before
and stays at ...`, `was not changed`), and `mstudio-build` exits with 1. No temporary tag
is created at any point.

What remains open: between the first and the last tag PUT, some tags point at the new
image and others at the old one. When the registry also refuses to move a tag back, that
tag keeps the new image and the final message names it.

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
| `BUILD_TIMEOUT` | seconds a single build may take. The builder then ends kaniko and everything it started, writes a failing result and exits | `3600` |
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

## Builds for the other architecture

Container Hosting runs amd64. The builder builds `linux/amd64` and `linux/arm64`, and an
arm64 builder (local development, CI) builds the same two the other way round.
`--platform linux/arm64` builds one arm64 image, `--platform linux/amd64,linux/arm64`
builds one image per platform and pushes them as one index:

```yaml
# GitHub Actions
- uses: docker/setup-qemu-action@v4
- uses: docker/setup-buildx-action@v4
- uses: docker/build-push-action@v7
  with:
    platforms: linux/amd64,linux/arm64
    push: true
    tags: ghcr.io/me/app:${{ github.sha }}
```

How the parts fit:

- `mstudio-build` queues one job per platform with `PLATFORM=linux/<arch>`. The builder
  passes it to kaniko as `--custom-platform`, so base images come for that platform and
  the image config says so. The jobs run one after the other, each in a fresh builder
  container. When one of them fails, `mstudio-build` stops with its exit code before it
  pushes anything, so the tags keep what they pointed at.
- With several platforms, `mstudio-build` pushes each image by digest
  (`crane push image.tar <repository>@sha256:...`), then ties them together in one index
  that every tag gets ([How a push moves the tags](#how-a-push-moves-the-tags)). No tag
  ever points at a single platform image. The pushes use the credentials of
  `docker login`, like any other push. `--iidfile` and
  `containerimage.digest` in `--metadata-file` get the digest of the index. There is no
  image store entry for an index, so several platforms need `--push`.
- A stage runs on the platform its `FROM --platform=` names, and every stage without one
  runs on the target platform. The predefined platform arguments are set, so the usual
  cross-compiling Dockerfile works as with BuildKit:

  ```dockerfile
  FROM --platform=$BUILDPLATFORM golang:1.26-alpine AS build
  ARG TARGETARCH
  COPY . /src
  RUN cd /src && CGO_ENABLED=0 GOARCH=$TARGETARCH go build -o /app .
  FROM gcr.io/distroless/static
  COPY --from=build /app /app
  ```

`RUN` in a stage of the other architecture needs emulation. The builder brings a static
qemu for the other architecture (Debian `qemu-user`, version in
`docker/builder/versions.json`) and runs every job in `docker/builder/sandbox.sh`, the
native ones included. A stage with a literal `FROM --platform=linux/arm64` can appear in
any build, and only the sandbox has qemu registered:

1. `loop.sh` copies the kaniko binary, CA certificates and the build context into a fresh
   root directory and gives it to uid 1. Every job gets a new one, so nothing one build
   unpacked leaks into the next.
2. `sandbox.sh` starts a user and mount namespace owned by uid 1. A second uid 1 process
   with `CAP_SETUID` and `CAP_SETGID` as ambient capabilities writes the map `0 1 65535`,
   so root inside is uid 1 outside and container uid 0 stays unmapped. That is what makes
   it work without `CAP_SETFCAP`.
3. Inside, it mounts its own `binfmt_misc` (per namespace since Linux 6.7), registers
   qemu with flag `F`, binds `/proc`, `/dev`, `/sys`, `resolv.conf` and `hosts` into the
   root and runs kaniko chrooted there.
4. `loop.sh` copies the tarball out of the root into the job directory.

Without a working sandbox every job takes the fallback path: kaniko on the root
filesystem of the container, which the Alpine conffile cleanup above protects. The
sandbox root starts empty.

On startup the builder probes which path works and writes the result into
`/builds/builder.env`:

| `EMULATION` | Meaning |
|---|---|
| `namespace` | the sandbox works, every job runs in it and `RUN` runs for both platforms |
| `host` | the sandbox fails, but the kernel runs binaries of the other architecture through a handler the host registered. Jobs run on the fallback path |
| `none` | no emulation. Builds for the other platform still work as long as no `RUN` step of that platform executes a binary: `COPY`-only stages and the cross-compiling pattern above |

The sandbox needs Linux 6.7 or newer, unprivileged user namespaces and no seccomp filter
that blocks `unshare`. Container Hosting has all three (kernel 7.0, `Seccomp: 0`, measured
on 2026-09-26). Docker's default seccomp profile blocks `unshare`, so a builder started
with plain `docker run` falls back.

`docker buildx ls`, `docker buildx inspect` and `docker run ... tonistiigi/binfmt` report
`PLATFORMS`. A `RUN` step that fails with `exec format error` gets an explanation: without
emulation it names the two ways around it, with emulation it points at a binary of the
wrong architecture in the context.

Emulated steps are slower. Measured on Container Hosting, `apk add file python3` plus a
short Python loop took 18 s for arm64 against 3 s native. CPU bound code runs up to 30
times slower, so compile in a `$BUILDPLATFORM` stage where the toolchain can cross-compile.

## What the shim fills in

| Flag or command | Behaviour |
|---|---|
| `--iidfile` | image id (config digest); with `--push` the digest of the pushed manifest or index, like buildx |
| `--metadata-file` | `containerimage.config.digest` (one platform only), `containerimage.digest` (only after a push), `image.name` |
| `docker images`, `docker inspect`, `docker tag`, `docker rmi` | served from the image store on the data volume |
| `docker push`, `docker pull`, `docker manifest inspect` | crane |
| `docker save`, `docker load` | copies the tarball in and out of the store. `docker load` needs `-i <file>`, it does not read from a pipe |
| `docker login`, `docker logout` | `crane auth login`, writes the usual `~/.docker/config.json` |
| `docker buildx create/inspect/ls`, `docker context inspect/ls` | answer with one fixed builder, so `setup-buildx-action` runs through. Its platforms are those in `builder.env` |
| `--platform` | one or both of `linux/amd64` and `linux/arm64`, see [above](#builds-for-the-other-architecture) |
| `docker run` of a `binfmt` or `qemu-user-static` image | does nothing, prints the platforms of the builder as JSON, which is what `docker/setup-qemu-action` parses |
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
| `--platform` or `FROM --platform=` with an architecture other than amd64 and arm64 | the builder has no emulator for it |
| `--platform` with several platforms and without `--push` | the images only come together as an index in a registry |
| `RUN --mount=...`, `--network=`, `--security=` in the Dockerfile | checked before the job is queued |
| `--output` other than `type=registry`, `push=true` or `type=docker,dest=` | no equivalent |
| `docker run` (other images), `exec`, `compose`, `ps`, `network`, `volume`, `commit` | need a daemon |
| `docker buildx bake` | not supported, call `docker build` per image |

`COPY --link` and here-documents in `RUN` produce a warning: kaniko ignores the first and
is untested with the second.

The builder defines the platform arguments BuildKit predefines: `BUILDPLATFORM`,
`BUILDOS`, `BUILDARCH`, `BUILDVARIANT`, `TARGETPLATFORM`, `TARGETOS`, `TARGETARCH` and
`TARGETVARIANT`. kaniko has none of them, so the builder patches it
(`docker/builder/patches/`). Like with BuildKit, a stage sees them after `ARG TARGETARCH`,
and a `--build-arg` of the same name wins. The same patch makes kaniko honor
`FROM --platform=`, with variables resolved from the build args. Upstream kaniko ignores
the flag and pulls every base image for the platform of the build.

## Limits

- **No layer cache.** kaniko can cache layers in a registry (`--cache-repo`), which fills
  the registry of the user with cache tags. Every build starts from the base image.
- **One build at a time per stack.** The builder claims one job, builds it and exits.
  Parallel jobs queue up, each build waits for the container to come back.
- **Two architectures.** amd64 and arm64. `RUN` for the one the builder does not run on
  needs emulation, see [above](#builds-for-the-other-architecture). In the sandbox, ids
  above 65534 do not exist, so a base image with files owned by such a uid fails to unpack.
  With `EMULATION=namespace` that holds for native builds as well.
- **No attestations, no SBOM.**
- **File capabilities stay in the base image only.** Some base images give binaries a
  capability, `caddy` for example carries `cap_net_bind_service` on `/usr/bin/caddy`. In
  the sandbox root owns the namespace, so the unpack keeps the capability. A copy made in
  a `RUN` step lost it there (`caddy`, measured). On the fallback path the builder cannot
  set it while unpacking, because the container lacks `CAP_SETFCAP` and the API cannot add
  it. Upstream kaniko aborts there. The builder patches kaniko (`docker/builder/patches/`)
  to print a warning and go on. The file keeps its capability in the base image layer, so
  the built image works. A file that a later step changes or copies (`COPY --from=` a
  stage with such a base image) loses it.
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
[builder] platforms linux/amd64,linux/arm64, emulation namespace (qemu in a user namespace)
[builder] ready, watching /builds/queue, one build per container, timeout 3600s
[builder] idle, queue empty for 300s
[builder] claimed build-1789578335-178
[builder] build-1789578335-178: destination=ghcr.io/me/app:1 dockerfile=Dockerfile platform=linux/arm64
[builder] build-1789578335-178: context 1.2M, 34 files
[builder] build-1789578335-178: running kaniko in a user namespace with qemu, output goes to the job log and to the runner
[builder] build-1789578335-178: exit=0 after 7s, replacing this container
```

Without emulation the first line names the reason, for example
`emulation none (user namespace with binfmt_misc unavailable: unshare: unshare failed: Operation not permitted)`.

The kaniko output itself goes to both places: into the job log of the pipeline and into
the container log.

## Troubleshooting

`image builds are turned off for this stack` means `/builds/queue` does not exist: the
builder service is missing from the stack or does not run.

`no builder took the job within 3900s, so it was taken back` means no builder claimed the
job within `MSTUDIO_BUILD_TIMEOUT`: the builder service is missing or not running. A build
whose builder died mid build does not wait for this timeout, the next builder fails it on
startup with `the build container was replaced before the build finished`. The log of the
builder service in mStudio shows what happened.

`the build took longer than BUILD_TIMEOUT=3600s and was stopped` means the builder ended
the build, including every process a `RUN` step left running, and exited. The build ends
with exit code 137. Raise `BUILD_TIMEOUT` on the builder service and
`MSTUDIO_BUILD_TIMEOUT` on the runner a little above it, or make the build faster.

`the build for linux/arm64 failed with exit code 1, nothing was pushed` comes from a build
for several platforms. None of the images went to the registry, and the tags point where
they pointed before.

`uploading sha256:... to <repository> failed, no tag was changed` means the credentials of
`docker login` do not cover that repository, or the registry refused the upload. The crane
error above it names the reason. Every tag points where it pointed before.

`tagging <tag> failed, every tag that existed before points at its previous image again`
means the registry accepted the upload but refused that tag, for example through a tag
protection rule. The lines above list each tag and its state. When the message says a tag
`could not be moved back`, set it by hand with
`crane tag <repository>@<previous digest> <tag>`; the log shows the previous digest.

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

`the builder cannot run RUN steps for linux/arm64` means the startup probe found no
emulation. The first line of the builder log says why. Move the work into a
`FROM --platform=$BUILDPLATFORM` stage, or check whether the kernel or a seccomp profile
blocks user namespaces.

A build that never starts although the runner sent it: compare the queue directory of the
runner with the one of the builder. Both mount `ci-builds/<stack id>`, so a runner that
was created before the stack got its own directory would write somewhere else.
