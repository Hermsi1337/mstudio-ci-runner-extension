// Package engine runs Docker containers as services of one mittwald stack.
//
// A container exists in two places. Its record lives in the shared state
// directory from the moment it is created (see package state). The service is
// declared only when the container starts, because Docker clients copy files
// into a created container before they start it and mittwald starts a service
// as soon as it is declared. Every service runs mstudio-init as its
// entrypoint, which in turn runs the process of the container.
//
// The engine only touches services it created. A client that can reach the
// Docker API can therefore not remove the runner or any other service of the
// stack.
package engine

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"log/slog"
	"net"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/mittwald/api-client-go/mittwaldv2/generated/clients/containerclientv2"
	"github.com/mittwald/api-client-go/mittwaldv2/generated/schemas/containerv2"

	"github.com/hermsi1337/mstudio-ci-runner-extension/docker/docker-api/internal/mittwald"
	"github.com/hermsi1337/mstudio-ci-runner-extension/docker/docker-api/internal/state"
)

var (
	ErrNotFound    = errors.New("not found")
	ErrConflict    = errors.New("conflict")
	ErrNotRunning  = errors.New("container is not running")
	ErrInvalid     = errors.New("invalid request")
	ErrUnsupported = errors.New("not supported on mittwald Container Hosting")
	ErrUnavailable = errors.New("temporarily unavailable")
)

// notFound errors carry their own message and still match ErrNotFound, which
// the handlers turn into 404.
type notFound string

func (e notFound) Error() string { return string(e) }

func (e notFound) Is(target error) bool { return target == ErrNotFound }

const (
	ErrNoSuchContainer = notFound("no such container")
	ErrImageNotFound   = notFound("no such image")
	ErrExecNotFound    = notFound("no such exec instance")
	ErrNoSuchNetwork   = notFound("no such network")
	ErrNoSuchPath      = notFound("no such file or directory")
)

// ServiceDescriptionPrefix marks the services the engine owns.
const ServiceDescriptionPrefix = "docker-adapter "

type Config struct {
	ProjectID string
	StackID   string

	// StateDir is the shared directory as the adapter sees it, StateHostPath
	// the same directory as a path of the project file system, which is what
	// the volumes of a service refer to.
	StateDir      string
	StateHostPath string

	// ProjectHome is the home directory of the project. Bind mounts must lie
	// below it. BindTranslations maps a path prefix as the client knows it to
	// a path of the project file system, so a runner can bind its workspace.
	ProjectHome      string
	BindTranslations map[string]string

	// SkipRegistry resolves images through the mittwald API only. Tests set
	// it, they run without network access to registries.
	SkipRegistry bool

	DefaultCPUs   string
	DefaultMemory string
	StartTimeout  time.Duration

	// Dial connects to a service. Tests replace it; in production it dials
	// the service name, which the stack network resolves.
	Dial   func(ctx context.Context, network, address string) (net.Conn, error)
	Logger *slog.Logger
}

type Engine struct {
	cfg      Config
	client   mittwald.ContainerClient
	log      *slog.Logger
	images   *ImageResolver
	forwards *forwarder
	execs    *execStore
	ryuk     *ryukServer
	events   *eventBus

	stackMu    sync.Mutex
	mu         sync.Mutex
	tombstones map[string]*state.Exit
}

func New(cfg Config, client mittwald.ContainerClient) (*Engine, error) {
	if cfg.Logger == nil {
		cfg.Logger = slog.Default()
	}
	if cfg.StartTimeout == 0 {
		cfg.StartTimeout = 5 * time.Minute
	}
	if cfg.Dial == nil {
		var d net.Dialer
		cfg.Dial = d.DialContext
	}
	for _, dir := range []string{cfg.StateDir, filepath.Join(cfg.StateDir, "containers"), filepath.Join(cfg.StateDir, "networks"), filepath.Join(cfg.StateDir, "bin"), filepath.Join(cfg.StateDir, "images"), filepath.Join(cfg.StateDir, "volumes")} {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			return nil, fmt.Errorf("prepare state directory: %w", err)
		}
	}
	e := &Engine{
		cfg:    cfg,
		client: client,
		log:    cfg.Logger,
		images: NewImageResolver(client, cfg.ProjectID, !cfg.SkipRegistry, filepath.Join(cfg.StateDir, "images")),
		execs:  newExecStore(),
		events: newEventBus(),
	}
	e.forwards = newForwarder(e.log, cfg.Dial)
	e.ryuk = newRyukServer(e)
	return e, nil
}

// Restore reopens the port forwards of running containers after a restart of
// the adapter and starts the background loops.
func (e *Engine) Restore(ctx context.Context) {
	for _, c := range e.containers() {
		if c.Virtual != "" {
			_ = e.remove(ctx, c, true)
			continue
		}
		if c.ServiceID != "" {
			if err := e.forwards.open(c, e.target(c)); err != nil {
				e.log.Warn("reopening port forwards failed", "container", c.ID, "error", err)
			}
		}
	}
	go e.autoRemoveLoop(ctx)
	go e.watchExits(ctx)
}

// InstallInit copies the running binary to the shared directory, where every
// container finds it as its entrypoint.
func (e *Engine) InstallInit() error {
	self, err := os.Executable()
	if err != nil {
		return err
	}
	src, err := os.ReadFile(self)
	if err != nil {
		return err
	}
	target := filepath.Join(e.cfg.StateDir, "bin", state.InitBinary)
	tmp := target + ".tmp"
	if err := os.WriteFile(tmp, src, 0o755); err != nil {
		return err
	}
	if err := os.Chmod(tmp, 0o755); err != nil {
		return err
	}
	return os.Rename(tmp, target)
}

func (e *Engine) dir(id string) state.Dir {
	return state.Dir(filepath.Join(e.cfg.StateDir, "containers", id))
}

func (e *Engine) containers() []*state.Container {
	entries, err := os.ReadDir(filepath.Join(e.cfg.StateDir, "containers"))
	if err != nil {
		return nil
	}
	var list []*state.Container
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		c, err := e.dir(entry.Name()).Container()
		if err != nil {
			continue
		}
		list = append(list, c)
	}
	sort.Slice(list, func(i, j int) bool { return list[i].Created.After(list[j].Created) })
	return list
}

// Resolve finds a container by full id, name or unique id prefix.
func (e *Engine) Resolve(ref string) (*state.Container, error) {
	ref = strings.TrimPrefix(ref, "/")
	if ref == "" {
		return nil, ErrNoSuchContainer
	}
	if c, err := e.dir(ref).Container(); err == nil {
		return c, nil
	}
	var byPrefix []*state.Container
	for _, c := range e.containers() {
		if c.Name == ref {
			return c, nil
		}
		if strings.HasPrefix(c.ID, ref) {
			byPrefix = append(byPrefix, c)
		}
	}
	if len(byPrefix) == 1 {
		return byPrefix[0], nil
	}
	if len(byPrefix) > 1 {
		return nil, fmt.Errorf("%w: multiple containers match %s", ErrInvalid, ref)
	}
	return nil, fmt.Errorf("%w: %s", ErrNoSuchContainer, ref)
}

func (e *Engine) save(c *state.Container) error {
	return state.WriteJSON(e.dir(c.ID).ConfigPath(), c)
}

func newID() string {
	b := make([]byte, 32)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

// services lists the services of the stack by name.
func (e *Engine) services(ctx context.Context) (map[string]containerv2.ServiceResponse, error) {
	list, _, err := e.client.ListServices(ctx, containerclientv2.ListServicesRequest{
		ProjectID: e.cfg.ProjectID,
		StackID:   &e.cfg.StackID,
	})
	if err != nil {
		return nil, fmt.Errorf("list services: %w", err)
	}
	byName := map[string]containerv2.ServiceResponse{}
	if list != nil {
		for _, s := range *list {
			byName[s.ServiceName] = s
		}
	}
	return byName, nil
}

func (e *Engine) service(ctx context.Context, c *state.Container) (*containerv2.ServiceResponse, error) {
	if c.ServiceID == "" {
		return nil, nil
	}
	svc, _, err := e.client.GetService(ctx, containerclientv2.GetServiceRequest{
		StackID:   e.cfg.StackID,
		ServiceID: c.ServiceID,
	})
	return svc, err
}

// updateStack serializes stack changes. Concurrent PATCH requests on one stack
// are accepted by the API, but the engine reads the service list right after
// its own change and must not see a half-applied other one.
func (e *Engine) updateStack(ctx context.Context, body containerclientv2.UpdateStackRequestBody) error {
	e.stackMu.Lock()
	defer e.stackMu.Unlock()
	_, _, err := e.client.UpdateStack(ctx, containerclientv2.UpdateStackRequest{
		StackID: e.cfg.StackID,
		Body:    body,
	})
	if err != nil {
		return fmt.Errorf("update stack: %w", err)
	}
	return nil
}
