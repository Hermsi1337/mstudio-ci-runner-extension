# AGENTS.md - AI Agent Guidelines

This document provides guidance for AI agents working on the mittwald-container-adapter codebase.

## Project Overview

This is a Go webservice that exposes a Docker Engine API (v1.44) compatible interface, translating requests to the mittwald mStudio container API. It allows standard Docker tooling to manage containers on the mittwald cloud platform.

## Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Docker CLI    │────▶│  Docker Adapter  │────▶│  mittwald API   │
│  docker-compose │     │   (this tool)    │     │    (mStudio)    │
└─────────────────┘     └──────────────────┘     └─────────────────┘
```

### Layer Responsibilities

| Layer | Package | Purpose |
|-------|---------|---------|
| HTTP Handlers | `internal/docker/handlers/` | Parse Docker API requests, return Docker API responses |
| Adapters | `internal/adapter/` | Business logic, orchestrate mittwald API calls |
| Mapper | `internal/mittwald/mapper.go` | Convert between Docker and mittwald types |
| Client | `internal/mittwald/client.go` | Interface wrapper for mittwald API client |

### Request Flow

1. HTTP request arrives at handler (e.g., `POST /containers/{id}/stop`)
2. Handler extracts parameters and calls adapter method
3. Adapter resolves container ID to service ID via `idMapper`
4. Adapter calls mittwald API via client interface
5. Mapper converts response types
6. Handler returns Docker-compatible JSON response

## Key Concepts

### Concept Mapping

| Docker | mittwald | Notes |
|--------|----------|-------|
| Container | Service | Direct 1:1 mapping |
| Container ID | Service ID | Supports short ID prefix lookup |
| Stack | Stack | A project can have multiple stacks |
| Volume | Volume | Direct mapping |
| Network | N/A | Dummy bridge network returned |

### Stack Operations

Services are added with `UpdateStack` (PATCH) and removed with `UpdateStack`
and an empty service body (`{"services":{"<name>":{}}}`). Never use
`DeclareStack` (PUT): it replaces the whole stack and drops the deploy
settings of services the adapter does not own, such as a CI runner.

### Containers, services and mstudio-init

See the README, "How it works". In short: a container is a record in the shared
state directory (`internal/state`), declared as a service on start, and its
process runs under `mstudio-init` (`internal/initproc`). Output, exit codes,
exec, archives and health checks go through files, never SSH.

The adapter only touches services it created. Keep it that way: every lookup
goes through the state directory, not through the service list.

## Type System

### Use moby/moby/api Types

Do NOT create custom Docker API types. Use official types from `github.com/moby/moby/api/types/`:

```go
import (
    "github.com/moby/moby/api/types/container"  // container.Summary, container.InspectResponse
    "github.com/moby/moby/api/types/image"      // image.Summary, image.InspectResponse
    "github.com/moby/moby/api/types/volume"     // volume.Volume, volume.ListResponse
    "github.com/moby/moby/api/types/network"    // network.PortSet, network.PortMap
    "github.com/moby/moby/api/types/mount"      // mount.Mount, mount.TypeBind
)
```

### Container State Constants

Use moby's state constants, not strings:

```go
container.StateRunning   // "running"
container.StateExited    // "exited"
container.StateCreated   // "created"
container.StateDead      // "dead"
```

## Project Structure

See the README, "Project structure".

## Testing

### Framework

Uses Ginkgo/Gomega BDD testing framework:

```go
var _ = Describe("ContainerAdapter", func() {
    Describe("Stop", func() {
        It("stops a running container", func() {
            // test code
            Expect(err).NotTo(HaveOccurred())
        })
    })
})
```

### Running Tests

```bash
go test ./...                    # Run all tests
go test ./internal/adapter/...   # Run adapter tests only
make test                        # Via Makefile
```

### Mock Client and fake platform

`internal/mocks/mock_client.go` mocks `ContainerClient` for unit tests.
`internal/fakeplatform` goes further: it runs every declared service as a local
`mstudio-init` process, so `internal/docker/cli_test.go` can drive the real
`docker` CLI against the adapter.

## Configuration

See the README, "Running it". Every new variable goes into `internal/config`,
the README table and this file if it changes how agents work.

## Common Tasks

### Adding a New Endpoint

1. Add route in `internal/docker/router.go`
2. Add handler method in appropriate `handlers/*.go` file
3. If needed, add adapter method in `internal/adapter/*.go`
4. Add mapper functions if type conversion needed
5. Add tests

### Adding a New mittwald API Call

1. Check the request struct in the mittwald client package
2. **Always include `StackID`** for service operations
3. Add method to `ContainerClient` interface if not present
4. Update mock client for testing

## Gotchas and Pitfalls

1. **StackID is required**: All service operations need `StackID`. Missing it causes cryptic "resource not found" errors with malformed URLs like `/v2/stacks//services/...`.
2. **The platform restarts every exited container**, `restart: "no"` included. `mstudio-init` stays alive after the process exits for that reason.
3. **Declared is not deployed**: after a PATCH the change is pending; wait for the pending state before `recreate`.
4. **Env values are limited to 800 characters** by the API. Container environment goes through the state directory, not the service.
5. **`:ro` volumes are rejected** by the API, and single files cannot be mounted reliably.
6. **DNS of a new service lags** and caches the miss. Dial the address the wrapper reports.

## Dependencies

| Package | Purpose |
|---------|---------|
| `github.com/mittwald/api-client-go` | mittwald API client |
| `github.com/moby/moby/api` | Docker API types |
| `github.com/gorilla/mux` | HTTP router |
| `github.com/onsi/ginkgo/v2` | Test framework |
| `github.com/onsi/gomega` | Test matchers |

## Commit Convention

Use conventional commits:

```
feat: add new feature
fix: fix a bug
refactor: code restructuring
docs: documentation changes
test: test additions/changes
```

Include a `Co-Authored-By` line when AI-assisted.
