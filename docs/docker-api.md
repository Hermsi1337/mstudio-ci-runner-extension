# Docker API for jobs

`docker/docker-api/` is a Docker Engine API (v1.44) on top of mittwald Container
Hosting. Docker clients in a job (the `docker` CLI, Testcontainers, dockerode)
create, run, exec into and remove containers, and each container becomes a
service of the stack the runner lives in. It started as a rework of
`mittwald/mstudio-docker-adapter`.

Turn on *Docker in jobs* when creating a runner or later in its settings. The
extension then sets `DOCKER_HOST=tcp://docker:2375` in the runner and adds the
service `docker` to the stack if it is missing. Existing pipelines and
Testcontainers suites need no change.

```yaml
# GitHub Actions
- run: docker run --rm alpine echo hello
- run: npm test   # Testcontainers finds DOCKER_HOST on its own
```

## Why it looks like this

The platform has no API to attach to a process, read its exit code or run a
command in it. It also restarts every container that exits, whatever its restart
policy says. A plain translation of Docker calls into mittwald calls therefore
cannot answer `docker run`, `docker wait` or `docker exec`.

So every container runs `mstudio-init` as its entrypoint, and the adapter and the
wrapper talk through files on the project file system:

```
 job / Testcontainers                   docker service                 stack services
 DOCKER_HOST=tcp://docker:2375   --->   Docker API, port forwards --> mstudio-init
                                        mittwald API client            + the process
                                              |                              |
                                              +---- shared directory --------+
                                                    on the project file system
```

`mstudio-init` is the adapter binary itself. On startup the adapter copies itself
into the shared directory, where every container finds it.

| Concern | How |
|---|---|
| Output | The wrapper writes stdout and stderr as timestamped frames into a log file. `logs`, `attach` and `docker run` read it, with follow, tail, since and timestamps. |
| Exit code | The wrapper records it and stays alive, so the container stays exited instead of being restarted. `wait`, `inspect` and `docker run` report it. |
| exec | The adapter writes a request, the wrapper runs it and streams output and exit code back. No SSH. |
| Files | `docker cp` and Testcontainers copies go through the shared directory. Files copied into a created container are extracted before its process starts. |
| Health checks | The wrapper runs the `HEALTHCHECK` of the container, `State.Health` reports it. |
| Ports | Published ports are opened on the adapter and forwarded to the address the wrapper reports. Clients connect to the host in `DOCKER_HOST`. |
| Names | The DNS of a stack resolves a new service only after some seconds and caches the miss. The adapter publishes names and network aliases as `/etc/hosts` entries, which the wrapper merges. |
| Ryuk | Testcontainers starts Ryuk to clean up after a session. Ryuk needs the Docker socket, so the adapter plays Ryuk in-process and removes the containers of a session ten seconds after it disconnected. |

A container is declared as a service only when it starts: mittwald starts a
service as soon as it exists, and clients copy files into a container between
create and start.

The adapter lists and touches only services it created, recognised by the
description prefix `docker-adapter `. The runner, the builder and every other
service of the stack are invisible to Docker clients. Services are removed with
`PATCH` and an empty body, never by declaring the whole stack.

## Shared directory

The adapter mounts `<project home>/.docker-adapter/<stack id>` at `STATE_DIR`.
A container sees only `bin/` and its own directory below `/.mstudio`.

| Path | Written by | Content |
|---|---|---|
| `bin/mstudio-init` | adapter | the wrapper |
| `containers/<id>/config.json` | adapter | the container as created: process, env, ports, networks |
| `containers/<id>/log` | wrapper | output frames: stream, unix nanos, length, payload |
| `containers/<id>/run.json`, `exit.json` | wrapper | generation, start, pid, addresses; exit code of the last run |
| `containers/<id>/heartbeat` | wrapper | touched every two seconds |
| `containers/<id>/health.json` | wrapper | health check state |
| `containers/<id>/hosts` | adapter | hosts entries of the other containers |
| `containers/<id>/control/<n>.json` | adapter | start and signal requests |
| `containers/<id>/archives/<n>.tar`, `<n>.json` | adapter | files to extract, answered with `<n>.done` or `<n>.error` |
| `containers/<id>/tasks/<id>/` | both | exec, stat and archive requests, output and result |
| `networks/<id>.json` | adapter | networks, bookkeeping only |

The environment of a container travels in `config.json`, not in the service,
because the API limits every environment value and every command element to 800
characters.

## What the extension does

| Moment | Effect |
|---|---|
| First runner of a stack with the option | declares the service `docker` (`src/domain/docker-api.ts`), limits 0.5 CPU and 512 MB |
| Runner with the option | `DOCKER_HOST=tcp://docker:2375` in its environment; the docker shim forwards container commands to the real CLI ([image-builds.md](image-builds.md#what-docker-in-jobs-forwards)) |
| Runner update | redeclares the service when its image is behind the release or its environment (secret, `PUBLIC_URL`) changed |
| Option off for the last runner of the stack, or its deletion | removes the containers the adapter started (description prefix `docker-adapter `), then the service `docker` |
| Instance removed | owned stacks go whole; in a selected stack the containers and the service `docker` are removed |

A stack that already holds a service called `docker` the extension did not
create is left alone; the option fails with a message before the runner gets
`DOCKER_HOST`. Declaring and removing the service run under a PostgreSQL advisory
lock per stack, so a runner that turns the option off cannot remove the service
while a sibling in the same stack turns it on. The shared directory
`<project home>/.docker-adapter/<stack id>` stays in the project file system,
like the build queue.

The extension needs `PUBLIC_URL`, the address the service `docker` reaches it at
([development.md](development.md#environment-variables)). Without it the option
is refused.

### Tokens

The adapter never sees a user token. It asks the extension for short-lived
tokens:

1. Whenever it declares the service, the extension generates a random secret
   (32 bytes, base64url, prefix `mdapi_` for secret scanners) and stores its
   SHA-256 in `docker_api_stacks`.
2. The secret goes into the environment of the service `docker` as
   `DOCKER_API_SECRET`, together with `DOCKER_API_TOKEN_URL`
   (`<PUBLIC_URL>/api/docker-api/token`, a path in `PUBLIC_URL` is kept). The
   database holds only the hash.
3. The adapter calls `POST /api/docker-api/token` with `Authorization: Bearer
   <secret>` and `{"stackId": "..."}`. The extension hashes the secret, compares
   it with the stored hash in constant time and answers with an access token of
   the extension instance (`extensionAuthenticateInstance`) and its expiry. The
   row exists exactly as long as the extension keeps the service, so a removed
   service gets no token.
4. The adapter keeps the token in memory and fetches a new one before it
   expires (`internal/tokensource`).

A plain SHA-256 is enough because the secret is random with 256 bits: a stolen
hash leaves nothing to guess. Every redeclaration of the service (image update,
changed `PUBLIC_URL`, secret not matching the hash) writes a new secret and a
new hash, all under the advisory lock of the stack, so parallel calls cannot
leave a service and a hash from different secrets. The hash is written before the
service is declared; a crash in between leaves a mismatch that the next call
detects and replaces. The token carries the scopes of the extension, which the
adapter needs anyway ([mstudio-setup.md](mstudio-setup.md)).

## Running it

The adapter runs as a service of the stack it manages. Outside the extension it
also takes a plain API token:

```yaml
docker:
  image: ghcr.io/hermsi1337/mstudio-ci-docker-api:<version>
  environment:
    MITTWALD_API_TOKEN: <token with access to the project>
    MITTWALD_PROJECT_ID: <project id>
    MITTWALD_STACK_ID: <stack id>
  volumes:
    - /home/<project short id>/.docker-adapter/<stack id>:/state
```

Clients in the same stack use `DOCKER_HOST=tcp://docker:2375`.

| Variable | Default | Meaning |
|---|---|---|
| `MITTWALD_API_TOKEN` | required unless `DOCKER_API_TOKEN_URL` is set | API token |
| `DOCKER_API_TOKEN_URL` | | endpoint of the extension that issues short-lived API tokens |
| `DOCKER_API_SECRET` | | bearer secret for `DOCKER_API_TOKEN_URL`, required with it |
| `MITTWALD_PROJECT_ID` | required | project of the stack |
| `MITTWALD_STACK_ID` | project id | stack the containers go into |
| `MITTWALD_API_BASE_URL` | `https://api.mittwald.de/v2` | API endpoint |
| `STATE_DIR` | `/state` | shared directory inside the adapter |
| `STATE_HOST_PATH` | `<project home>/.docker-adapter/<stack id>` | the same directory as a project path |
| `BIND_TRANSLATIONS` | | `/client/path=/project/path,...`, maps bind mount sources of clients to the project file system |
| `DEFAULT_CPUS` | `1` | CPU limit of a container without `--cpus` |
| `DEFAULT_MEMORY` | `2048mb` | memory limit of a container without `--memory` |
| `ADAPTER_HOST`, `ADAPTER_PORT` | `0.0.0.0`, `2375` | listen address |
| `LOG_LEVEL` | `info` | `debug`, `info`, `warn`, `error` |

The extension sets `DOCKER_API_TOKEN_URL` and `DOCKER_API_SECRET`, and the
adapter then fetches short-lived API tokens from it instead of using
`MITTWALD_API_TOKEN`.

The adapter has no authentication. Everything that reaches its port controls the
containers it created; keep it inside the stack. That is the same trust boundary
as the build queue ([image-builds.md](image-builds.md)): one stack per trust
boundary.

## Limits

- The adapter reads entrypoint, command, environment and ports of an image from
  its registry, anonymously or with the credentials a client sent with a pull.
  The image lookup of the mittwald API (`GET /v2/container-image-config`)
  refuses extension tokens and is only a fallback for a user token
  (`MITTWALD_API_TOKEN`). Anonymous manifest reads count against the Docker Hub
  rate limit of the project's address; results are cached for ten minutes.
  Private images need two things, see [Private images](#private-images).
- No image builds. `POST /build` answers 501. Build and push in the pipeline,
  then run the image from the registry.
- No stdin. `docker run -i` and `docker exec -i` get an empty input.
- No TTY. `-t` is accepted, the output is not a terminal.
- No read-only mounts, no tmpfs, no `--privileged`, no capabilities. The API
  rejects `:ro` and has no field for the others.
- Bind mount sources must lie on the project file system (see `BIND_TRANSLATIONS`).
- One network per stack. Network create and connect are bookkeeping; names and
  aliases resolve for every container of the stack.
- The first start of an image includes the pull by the platform. With a cached
  image a container starts in about four seconds.
- Stats and top return empty values.

## Private images

The platform pulls the image of a container itself, and the adapter reads its
configuration. Both need access:

1. **Once, in mStudio:** add the registry to the project (*Container →
   Registries*), for GHCR `ghcr.io` with a user and a token with
   `read:packages`. mittwald pulls with it when the container starts. The
   extension never writes registry credentials into the project.
2. **In the job:** `docker login` to the same registry before the first `docker
   run` or Testcontainers start. A private image looks missing to the adapter
   until then; the docker CLI and Testcontainers then pull it and send the
   credentials as `X-Registry-Auth`. The adapter keeps them in memory, per
   registry host, and never writes them anywhere. Every job of the stack uses
   them afterwards, the same trust boundary as the rest of the stack.

```yaml
# GitHub Actions
- uses: docker/login-action@v4
  with:
    registry: ghcr.io
    username: ${{ github.actor }}
    password: ${{ secrets.GITHUB_TOKEN }}
- run: docker run --rm ghcr.io/me/private-tool:1
```

## Development and tests

```bash
cd docker/docker-api
go test ./...                          # unit tests, docker CLI tests against a fake platform
go run ./cmd/localsim 127.0.0.1:2375   # Docker API on this machine, containers run as local processes
```

`internal/docker/cli_test.go` drives the real `docker` CLI against the adapter
with `internal/fakeplatform`, which runs every service as a local `mstudio-init`
process. The tests skip when no `docker` CLI is installed. `cmd/localsim` does the
same interactively, for trying clients such as Testcontainers.

`e2e/testcontainers` is a Testcontainers suite for a live stack. Run it in a
container of the stack with `DOCKER_HOST=tcp://docker:2375` and `npm test`.

| Package | Content |
|---|---|
| `cmd/adapter` | entrypoint; `mstudio-init` when called as such |
| `cmd/localsim` | Docker API with a fake platform |
| `internal/engine` | containers as services: create, start, stop, logs, exec, archives, ports, networks, Ryuk |
| `internal/initproc` | `mstudio-init`: process, exit code, exec, archives, health checks, hosts |
| `internal/state` | the shared directory: layout, records, log frames |
| `internal/tarutil` | archive extraction and packing with Docker semantics |
| `internal/docker` | HTTP routing and handlers |
| `internal/adapter` | volumes |
| `internal/mittwald` | client interfaces |
| `internal/fakeplatform` | fake mittwald API for tests |

## Platform behaviour this relies on

Measured in a project, not documented by mittwald:

- Every container that exits is restarted, `restart: "no"` included.
- A `PATCH` on a stack is pending for a moment. A `recreate` right after it
  redeploys the old state, and the service list lags behind as well.
- The DNS of a stack resolves a new service after several seconds and caches the
  miss.
- The project file system is shared by every container of the project, not
  mounted `noexec`, and idmapped, so directories the wrapper writes to are
  world-writable.
