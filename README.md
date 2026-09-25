# mittwald Docker API Adapter

A Docker Engine API (v1.44) on top of mittwald Container Hosting. Docker clients
(the `docker` CLI, Testcontainers, dockerode) create, run, exec into and remove
containers, and each container becomes a service of one mittwald stack.

This is a fork of `mittwald/mstudio-docker-adapter`. The goal of the fork is
running Testcontainers suites and `docker run` from CI runners on Container
Hosting, where no Docker daemon exists.

> Experimental. The API surface is what Testcontainers and the `docker` CLI
> need, not the whole Engine API.

## How it works

```
 CI job / Testcontainers                adapter service               stack services
 DOCKER_HOST=tcp://docker:2375   --->   Docker API, port forwards --> mstudio-init
                                        mittwald API client            + the process
                                              |                              |
                                              +---- shared directory --------+
                                                    on the project file system
```

The platform has no API to attach to a process, read its exit code or run a
command in it, and it restarts every container that exits, whatever its restart
policy says. So every container runs `mstudio-init` as its entrypoint, and the
adapter and the wrapper talk through files:

| Concern | How |
|---|---|
| Output | The wrapper writes stdout and stderr as timestamped frames into a log file. `logs`, `attach` and `docker run` read it, with follow, tail, since and timestamps. |
| Exit code | The wrapper records it and stays alive, so the container stays exited instead of being restarted. `wait`, `inspect` and `docker run` report it. |
| exec | The adapter writes a request, the wrapper runs it and streams output and exit code back. No SSH. |
| Files | `docker cp` and Testcontainers copies go through the same directory. Files copied into a created container are extracted before its process starts. |
| Health checks | The wrapper runs the `HEALTHCHECK` of the container, `State.Health` reports it. |
| Ports | Published ports are opened on the adapter and forwarded to the container. Clients connect to the host in `DOCKER_HOST`. |
| Names | Services reach each other by service name. Because the DNS of a stack resolves a new service only after some seconds, the adapter also publishes names and network aliases as `/etc/hosts` entries, which the wrapper merges. |
| Ryuk | Testcontainers starts Ryuk to clean up after a session. Ryuk needs the Docker socket, so the adapter plays Ryuk in-process and removes the containers of a session ten seconds after it disconnected. |

A container is declared as a service only when it starts: mittwald starts a
service as soon as it exists, and clients copy files into a container between
create and start.

The adapter only lists and touches services it created (their description starts
with `docker-adapter `). Other services of the stack, such as a CI runner, are
invisible to Docker clients.

## Running it

The adapter runs as a service of the stack it manages. It needs the project
file system mounted at `STATE_DIR`, at the path `STATE_HOST_PATH` names:

```yaml
docker:
  image: <adapter image>
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
| `MITTWALD_API_TOKEN` | required | API token |
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

The adapter has no authentication. Everything that reaches its port controls the
containers of the stack; keep it inside the stack.

## Limits

- No image builds. `POST /build` answers 501; build and push in the pipeline,
  then run the image from the registry.
- No stdin. `docker run -i` and `docker exec -i` get an empty input.
- No TTY. `-t` is accepted, output is not a terminal.
- No read-only mounts, no tmpfs, no `--privileged`, no capabilities.
- Bind mount sources must lie on the project file system (see `BIND_TRANSLATIONS`).
- One network per stack. Network create and connect are bookkeeping; names and
  aliases resolve for every container of the stack.
- The first start of an image includes the pull by the platform.
- Stats and top return empty values.

## Development

```bash
go test ./...                       # unit tests and docker CLI tests against a fake platform
go run ./cmd/localsim 127.0.0.1:2375  # Docker API on this machine, containers run as local processes
```

`internal/docker/cli_test.go` drives the real `docker` CLI against the adapter
with `internal/fakeplatform`, which runs every service as a local
`mstudio-init` process. `cmd/localsim` does the same interactively, for trying
clients such as Testcontainers.

`e2e/testcontainers` is a Testcontainers suite for a live stack: run it in a
container of the stack with `DOCKER_HOST=tcp://docker:2375` and `npm test`.

### Project structure

```
cmd/adapter/            entrypoint; also mstudio-init when called as such
cmd/localsim/           Docker API with a fake platform, for local experiments
internal/engine/        containers as services: create, start, stop, logs, exec, archives, ports, networks, Ryuk
internal/initproc/      mstudio-init: process, exit code, exec, archives, health checks, hosts
internal/state/         the shared directory: layout, records, log frames
internal/tarutil/       archive extraction and packing with Docker semantics
internal/docker/        HTTP routing and handlers
internal/adapter/       volumes
internal/mittwald/      client interfaces
internal/fakeplatform/  fake mittwald API for tests
e2e/testcontainers/     live Testcontainers suite
```
