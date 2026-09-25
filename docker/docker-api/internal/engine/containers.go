package engine

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/mittwald/api-client-go/mittwaldv2/generated/clients/containerclientv2"
	"github.com/mittwald/api-client-go/mittwaldv2/generated/schemas/containerv2"
	"github.com/moby/moby/api/types/container"
	"github.com/moby/moby/api/types/mount"
	"github.com/moby/moby/api/types/network"

	"github.com/mittwald/mittwald-container-adapter/internal/initproc"
	"github.com/mittwald/mittwald-container-adapter/internal/state"
)

var ErrNotModified = errors.New("not modified")

type CreateOptions struct {
	Name      string
	NameGiven bool
	Request   container.CreateRequest
}

type CreateResult struct {
	ID       string
	Warnings []string
}

func (e *Engine) Create(ctx context.Context, opts CreateOptions) (*CreateResult, error) {
	req := opts.Request
	if req.Config == nil || req.Image == "" {
		return nil, fmt.Errorf("%w: no image given", ErrInvalid)
	}
	host := req.HostConfig
	if host == nil {
		host = &container.HostConfig{}
	}
	if opts.NameGiven {
		if _, err := e.Resolve(opts.Name); err == nil {
			return nil, fmt.Errorf("%w: the container name \"/%s\" is already in use", ErrConflict, opts.Name)
		}
	}

	c := &state.Container{
		ID:          newID(),
		Name:        strings.TrimPrefix(opts.Name, "/"),
		NameGiven:   opts.NameGiven,
		Created:     time.Now().UTC(),
		Image:       req.Image,
		Labels:      req.Labels,
		Ports:       map[string]string{},
		Networks:    map[string]state.Endpoint{},
		NetworkMode: string(host.NetworkMode),
		AutoRemove:  host.AutoRemove,
		StopSignal:  req.StopSignal,
		StopTimeout: req.StopTimeout,
		CPUs:        e.cfg.DefaultCPUs,
		Memory:      e.cfg.DefaultMemory,
	}
	var warnings []string

	if isRyukImage(req.Image) {
		c.Virtual = virtualRyuk
		c.ServiceName = "ryuk"
		c.Ports["8080/tcp"] = ""
		c.Process = state.Process{Args: []string{"/bin/ryuk"}}
		return e.finishCreate(c, warnings)
	}

	img, err := e.images.Resolve(ctx, req.Image)
	if err != nil {
		return nil, err
	}
	c.ImageDigest = img.Digest
	c.ImageEnv = img.Env
	c.Entrypoint, c.Cmd = req.Entrypoint, req.Cmd
	entrypoint := img.Entrypoint
	cmd := img.Cmd
	if len(req.Entrypoint) > 0 {
		entrypoint = req.Entrypoint
		cmd = nil
	}
	if len(req.Cmd) > 0 {
		cmd = req.Cmd
	}
	args := append(append([]string{}, entrypoint...), cmd...)
	if len(args) == 0 {
		return nil, fmt.Errorf("%w: no command specified", ErrInvalid)
	}
	if hc := req.Healthcheck; hc != nil && len(hc.Test) > 0 {
		c.Health = &state.HealthConfig{
			Test:          hc.Test,
			Interval:      hc.Interval,
			Timeout:       hc.Timeout,
			StartPeriod:   hc.StartPeriod,
			StartInterval: hc.StartInterval,
			Retries:       hc.Retries,
		}
	}
	c.Process = state.Process{
		Args:       args,
		Env:        req.Env,
		WorkingDir: req.WorkingDir,
		User:       req.User,
		Tty:        req.Tty,
	}

	for port := range req.ExposedPorts {
		c.Ports[port.String()] = ""
	}
	for port, bindings := range host.PortBindings {
		hostPort := ""
		if len(bindings) > 0 {
			hostPort = bindings[0].HostPort
		}
		c.Ports[port.String()] = hostPort
	}
	if host.PublishAllPorts {
		for _, p := range img.ExposedPorts {
			if _, ok := c.Ports[p]; !ok {
				c.Ports[p] = ""
			}
		}
	}

	volumes, volumeWarnings, err := e.volumes(host)
	if err != nil {
		return nil, err
	}
	c.Volumes = volumes
	warnings = append(warnings, volumeWarnings...)

	if host.NanoCPUs > 0 {
		c.CPUs = strconv.FormatFloat(float64(host.NanoCPUs)/1e9, 'f', -1, 64)
	}
	if host.Memory > 0 {
		c.Memory = fmt.Sprintf("%dmb", (host.Memory+(1<<20)-1)>>20)
	}
	if host.Privileged {
		warnings = append(warnings, "--privileged is ignored, mittwald Container Hosting runs containers without privileges")
	}

	aliases := e.attachNetworks(c, req.NetworkingConfig)

	if err := e.pickServiceName(ctx, c, opts.NameGiven, aliases); err != nil {
		return nil, err
	}
	return e.finishCreate(c, warnings)
}

func (e *Engine) finishCreate(c *state.Container, warnings []string) (*CreateResult, error) {
	dir := e.dir(c.ID)
	if err := dir.Prepare(); err != nil {
		return nil, fmt.Errorf("prepare container directory: %w", err)
	}
	if err := e.save(c); err != nil {
		_ = os.RemoveAll(string(dir))
		return nil, err
	}
	e.log.Info("container created", "id", c.ID[:12], "name", c.Name, "image", c.Image, "service", c.ServiceName)
	return &CreateResult{ID: c.ID, Warnings: warnings}, nil
}

// volumes turns binds and mounts into volume specs of the mittwald API, which
// accepts "name:/path" for stack volumes and "/project/path:/path" for the
// project file system, without mount options.
func (e *Engine) volumes(host *container.HostConfig) ([]string, []string, error) {
	var specs, warnings []string
	add := func(source, target string, bind bool) error {
		if target == "" {
			return fmt.Errorf("%w: mount without target", ErrInvalid)
		}
		if source == "" {
			warnings = append(warnings, fmt.Sprintf("anonymous volume %s is not persisted", target))
			return nil
		}
		if strings.HasSuffix(source, "docker.sock") {
			warnings = append(warnings, fmt.Sprintf("%s is not mounted, there is no Docker socket on mittwald Container Hosting", source))
			return nil
		}
		if !bind {
			specs = append(specs, sanitizeName(source)+":"+target)
			return nil
		}
		translated, err := e.projectPath(source)
		if err != nil {
			return err
		}
		specs = append(specs, translated+":"+target)
		return nil
	}
	for _, bind := range host.Binds {
		parts := strings.Split(bind, ":")
		if len(parts) < 2 {
			return nil, nil, fmt.Errorf("%w: invalid volume specification %q", ErrInvalid, bind)
		}
		if len(parts) > 2 && strings.Contains(parts[2], "ro") {
			warnings = append(warnings, fmt.Sprintf("%s is mounted read-write, the platform has no read-only mounts", parts[1]))
		}
		if err := add(parts[0], parts[1], strings.HasPrefix(parts[0], "/")); err != nil {
			return nil, nil, err
		}
	}
	for _, m := range host.Mounts {
		switch m.Type {
		case mount.TypeBind:
			if err := add(m.Source, m.Target, true); err != nil {
				return nil, nil, err
			}
		case mount.TypeVolume:
			if err := add(m.Source, m.Target, false); err != nil {
				return nil, nil, err
			}
		default:
			warnings = append(warnings, fmt.Sprintf("%s mount at %s is not supported and skipped", m.Type, m.Target))
		}
		if m.ReadOnly {
			warnings = append(warnings, fmt.Sprintf("%s is mounted read-write, the platform has no read-only mounts", m.Target))
		}
	}
	for target := range host.Tmpfs {
		warnings = append(warnings, fmt.Sprintf("tmpfs at %s is not supported and skipped", target))
	}
	return specs, warnings, nil
}

// projectPath maps a bind source to the project file system.
func (e *Engine) projectPath(source string) (string, error) {
	source = filepath.Clean(source)
	best := ""
	for prefix := range e.cfg.BindTranslations {
		p := filepath.Clean(prefix)
		if (source == p || strings.HasPrefix(source, p+"/")) && len(p) > len(best) {
			best = p
		}
	}
	if best != "" {
		source = filepath.Join(e.cfg.BindTranslations[best], strings.TrimPrefix(source, best))
	}
	home := filepath.Clean(e.cfg.ProjectHome)
	if e.cfg.ProjectHome == "" || (source != home && !strings.HasPrefix(source, home+"/")) {
		return "", fmt.Errorf("%w: bind mount source %s is not on the project file system (%s); mount a directory below it", ErrInvalid, source, e.cfg.ProjectHome)
	}
	return source, nil
}

// pickServiceName chooses the DNS name of the container in the stack. A
// container without a name of its own takes its first network alias, so other
// containers reach it under the name the client expects.
func (e *Engine) pickServiceName(ctx context.Context, c *state.Container, nameGiven bool, aliases []string) error {
	base := c.Name
	if !nameGiven && len(aliases) > 0 {
		base = aliases[0]
	}
	base = sanitizeName(base)
	taken, err := e.services(ctx)
	if err != nil {
		return err
	}
	reserved := map[string]bool{}
	for name := range taken {
		reserved[name] = true
	}
	for _, other := range e.containers() {
		reserved[other.ServiceName] = true
	}
	name := base
	for i := 2; reserved[name]; i++ {
		suffix := "-" + strconv.Itoa(i)
		name = strings.TrimRight(truncate(base, 63-len(suffix)), "-") + suffix
	}
	c.ServiceName = name
	return nil
}

func truncate(s string, n int) string {
	if len(s) > n {
		return s[:n]
	}
	return s
}

// sanitizeName turns a Docker name into a service or volume name: lower case
// letters, digits and dashes, at most 63 characters.
func sanitizeName(name string) string {
	name = strings.TrimPrefix(name, "/")
	name = strings.Map(func(r rune) rune {
		switch {
		case r >= 'a' && r <= 'z', r >= '0' && r <= '9', r == '-':
			return r
		case r >= 'A' && r <= 'Z':
			return r + 32
		}
		return '-'
	}, name)
	name = strings.Trim(truncate(strings.Trim(name, "-"), 63), "-")
	if name == "" || (name[0] >= '0' && name[0] <= '9') {
		name = "c-" + name
	}
	return strings.Trim(truncate(name, 63), "-")
}

func (e *Engine) serviceRequest(c *state.Container) containerv2.ServiceRequest {
	description := ServiceDescriptionPrefix + c.ID[:12] + " " + c.Name
	image := c.Image
	self := filepath.Join(e.cfg.StateHostPath, "containers", c.ID) + ":" + state.SelfDir
	bin := filepath.Join(e.cfg.StateHostPath, "bin") + ":" + state.BinDir
	req := containerv2.ServiceRequest{
		Image:       &image,
		Description: &description,
		Entrypoint:  []string{state.InitPath},
		Command:     []string{},
		Volumes:     append([]string{self, bin}, c.Volumes...),
	}
	limits := containerv2.ResourceSpec{}
	if c.CPUs != "" {
		cpus := c.CPUs
		limits.Cpus = &cpus
	}
	if c.Memory != "" {
		memory := c.Memory
		limits.Memory = &memory
	}
	if limits.Cpus != nil || limits.Memory != nil {
		req.Deploy = &containerv2.Deploy{Resources: &containerv2.Resources{Limits: &limits}}
	}
	return req
}

func (e *Engine) declare(ctx context.Context, c *state.Container) error {
	body := containerclientv2.UpdateStackRequestBody{
		Services: map[string]containerv2.ServiceRequest{c.ServiceName: e.serviceRequest(c)},
	}
	for _, v := range c.Volumes {
		name, _, _ := strings.Cut(v, ":")
		if !strings.HasPrefix(name, "/") {
			if body.Volumes == nil {
				body.Volumes = map[string]containerv2.VolumeRequest{}
			}
			n := name
			body.Volumes[name] = containerv2.VolumeRequest{Name: &n}
		}
	}
	if err := e.updateStack(ctx, body); err != nil {
		return err
	}
	// The service list lags behind the stack update for a moment.
	var svc containerv2.ServiceResponse
	for attempt := 0; ; attempt++ {
		services, err := e.services(ctx)
		if err != nil {
			return err
		}
		var ok bool
		if svc, ok = services[c.ServiceName]; ok {
			break
		}
		if attempt == 40 {
			return fmt.Errorf("service %s is missing after declaring it", c.ServiceName)
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(250 * time.Millisecond):
		}
	}
	c.ServiceID = svc.Id
	e.log.Info("service declared", "container", c.ID[:12], "service", c.ServiceName, "serviceId", svc.Id)
	return e.save(c)
}

func (e *Engine) Start(ctx context.Context, ref string) error {
	c, err := e.Resolve(ref)
	if err != nil {
		return err
	}
	if c.Virtual != "" {
		return e.ryuk.start(c)
	}
	dir := e.dir(c.ID)
	before := dir.Status()
	if before.Running() && (c.ServiceID == "" || dir.Alive()) && before.Started() {
		return ErrNotModified
	}
	if c.ServiceID == "" {
		if err := e.declare(ctx, c); err != nil {
			return err
		}
	} else {
		if _, err := state.Enqueue(dir.ControlDir(), ".json", func(p string) error {
			return state.WriteJSON(p, state.Control{Action: "start"})
		}); err != nil {
			return err
		}
		if svc, err := e.service(ctx, c); err == nil && svc != nil && svc.Status == containerv2.ServiceStatusStopped {
			_, _ = e.client.StartService(ctx, containerclientv2.StartServiceRequest{StackID: e.cfg.StackID, ServiceID: c.ServiceID})
		}
	}
	if err := e.forwards.open(c, e.target(c)); err != nil {
		e.log.Warn("port forward failed", "container", c.ID[:12], "error", err)
	}
	if err := e.save(c); err != nil {
		return err
	}
	if err := e.waitStarted(ctx, c, before.Generation()); err != nil {
		return err
	}
	e.publishHosts()
	return nil
}

// waitStarted returns once the wrapper started a new generation of the
// process, which is when `docker start` returns on a real engine as well.
func (e *Engine) waitStarted(ctx context.Context, c *state.Container, previous int) error {
	dir := e.dir(c.ID)
	deadline := time.Now().Add(e.cfg.StartTimeout)
	nextServiceCheck := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		if dir.Status().Generation() > previous {
			return nil
		}
		if time.Now().After(nextServiceCheck) {
			nextServiceCheck = time.Now().Add(3 * time.Second)
			if svc, err := e.service(ctx, c); err == nil && svc != nil && svc.Status == containerv2.ServiceStatusError {
				message := ""
				if svc.Message != nil {
					message = *svc.Message
				}
				return fmt.Errorf("container %s failed to start: %s", c.Name, message)
			}
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(150 * time.Millisecond):
		}
	}
	return fmt.Errorf("container %s did not start within %s", c.Name, e.cfg.StartTimeout)
}

func (e *Engine) signal(c *state.Container, sig string) error {
	if _, err := initproc.ParseSignal(sig); err != nil {
		return fmt.Errorf("%w: %v", ErrInvalid, err)
	}
	_, err := state.Enqueue(e.dir(c.ID).ControlDir(), ".json", func(p string) error {
		return state.WriteJSON(p, state.Control{Action: "signal", Signal: sig})
	})
	return err
}

func (e *Engine) waitExit(ctx context.Context, c *state.Container, generation int, timeout time.Duration) bool {
	dir := e.dir(c.ID)
	deadline := time.Now().Add(timeout)
	for {
		if ex, err := dir.Exit(); err == nil && ex.Generation >= generation {
			return true
		}
		if time.Now().After(deadline) {
			return false
		}
		select {
		case <-ctx.Done():
			return false
		case <-time.After(100 * time.Millisecond):
		}
	}
}

func (e *Engine) Stop(ctx context.Context, ref string, timeout *int, sig string) error {
	c, err := e.Resolve(ref)
	if err != nil {
		return err
	}
	return e.stop(ctx, c, timeout, sig)
}

func (e *Engine) stop(ctx context.Context, c *state.Container, timeout *int, sig string) error {
	if c.Virtual != "" {
		return e.ryuk.stop(c)
	}
	st := e.dir(c.ID).Status()
	if !st.Running() {
		return ErrNotModified
	}
	if sig == "" {
		sig = c.StopSignal
	}
	if sig == "" {
		sig = "SIGTERM"
	}
	grace := 10
	if c.StopTimeout != nil {
		grace = *c.StopTimeout
	}
	if timeout != nil {
		grace = *timeout
	}
	if grace > 0 {
		if err := e.signal(c, sig); err != nil {
			return err
		}
		if e.waitExit(ctx, c, st.Generation(), time.Duration(grace)*time.Second) {
			return nil
		}
	}
	if err := e.signal(c, "SIGKILL"); err != nil {
		return err
	}
	if !e.waitExit(ctx, c, st.Generation(), 15*time.Second) {
		return fmt.Errorf("container %s did not stop", c.Name)
	}
	return nil
}

func (e *Engine) Kill(ctx context.Context, ref, sig string) error {
	c, err := e.Resolve(ref)
	if err != nil {
		return err
	}
	if c.Virtual != "" {
		return e.ryuk.stop(c)
	}
	if !e.dir(c.ID).Status().Running() {
		return fmt.Errorf("%w: container %s is not running", ErrConflict, c.ID)
	}
	if sig == "" {
		sig = "SIGKILL"
	}
	return e.signal(c, sig)
}

func (e *Engine) Restart(ctx context.Context, ref string, timeout *int, sig string) error {
	c, err := e.Resolve(ref)
	if err != nil {
		return err
	}
	if err := e.stop(ctx, c, timeout, sig); err != nil && !errors.Is(err, ErrNotModified) {
		return err
	}
	err = e.Start(ctx, c.ID)
	if errors.Is(err, ErrNotModified) {
		return nil
	}
	return err
}

func (e *Engine) Remove(ctx context.Context, ref string, force bool) error {
	c, err := e.Resolve(ref)
	if err != nil {
		return err
	}
	if !force && c.Virtual == "" && e.dir(c.ID).Status().Running() {
		return fmt.Errorf("%w: you cannot remove a running container %s, stop it first or force the removal", ErrConflict, c.ID)
	}
	return e.remove(ctx, c, force)
}

func (e *Engine) remove(ctx context.Context, c *state.Container, force bool) error {
	if c.Virtual != "" {
		_ = e.ryuk.stop(c)
	}
	e.forwards.close(c.ID)
	if ex, err := e.dir(c.ID).Exit(); err == nil {
		e.bury(c.ID, ex)
	}
	if c.ServiceID == "" && c.Virtual == "" {
		// A declare that failed half way leaves a service without a
		// recorded id; its description still names the container.
		if services, err := e.services(ctx); err == nil {
			if svc, ok := services[c.ServiceName]; ok && strings.HasPrefix(svc.Description, ServiceDescriptionPrefix+c.ID[:12]) {
				c.ServiceID = svc.Id
			}
		}
	}
	if c.ServiceID != "" {
		if force && e.dir(c.ID).Status().Running() {
			_ = e.signal(c, "SIGKILL")
		}
		err := e.updateStack(ctx, containerclientv2.UpdateStackRequestBody{
			Services: map[string]containerv2.ServiceRequest{c.ServiceName: {}},
		})
		if err != nil {
			return err
		}
	}
	if err := os.RemoveAll(string(e.dir(c.ID))); err != nil {
		e.log.Warn("removing container directory failed", "container", c.ID[:12], "error", err)
	}
	e.publishHosts()
	e.execs.dropContainer(c.ID)
	e.log.Info("container removed", "id", c.ID[:12], "name", c.Name, "service", c.ServiceName)
	return nil
}

type WaitResult struct {
	StatusCode int
	Error      string
}

func (e *Engine) Wait(ctx context.Context, ref string, condition container.WaitCondition) (*WaitResult, error) {
	c, err := e.Resolve(ref)
	if err != nil {
		return nil, err
	}
	dir := e.dir(c.ID)
	// The last exit seen is kept: with --rm the directory is gone by the time
	// the removal is noticed.
	last := &WaitResult{}
	result := func() *WaitResult {
		ex, err := dir.Exit()
		if err != nil {
			ex = e.tombstone(c.ID)
		}
		if ex != nil {
			last = &WaitResult{StatusCode: ex.Code, Error: ex.Error}
		}
		return last
	}
	st := dir.Status()
	target := st.Generation()
	if !st.Running() && condition == container.WaitConditionNextExit {
		target++
	}
	if !st.Started() {
		target = 1
	}
	for {
		switch condition {
		case container.WaitConditionRemoved:
			res := result()
			if _, err := os.Stat(dir.ConfigPath()); os.IsNotExist(err) {
				return res, nil
			}
		case container.WaitConditionNextExit:
			if ex, err := dir.Exit(); err == nil && ex.Generation >= target {
				return result(), nil
			}
		default:
			s := dir.Status()
			if !s.Started() || !s.Running() {
				return result(), nil
			}
		}
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		case <-time.After(200 * time.Millisecond):
		}
	}
}

// autoRemoveLoop removes containers created with --rm once they exited.
func (e *Engine) autoRemoveLoop(ctx context.Context) {
	for {
		select {
		case <-ctx.Done():
			return
		case <-time.After(time.Second):
		}
		for _, c := range e.containers() {
			if !c.AutoRemove || c.Virtual != "" {
				continue
			}
			st := e.dir(c.ID).Status()
			if st.Started() && !st.Running() {
				if err := e.remove(ctx, c, true); err != nil {
					e.log.Warn("auto remove failed", "container", c.ID[:12], "error", err)
				}
			}
		}
	}
}

func (e *Engine) attachNetworks(c *state.Container, cfg *network.NetworkingConfig) []string {
	var aliases []string
	if cfg == nil {
		return nil
	}
	for name, endpoint := range cfg.EndpointsConfig {
		net, err := e.network(name)
		if err != nil {
			continue
		}
		ep := state.Endpoint{NetworkID: net.ID}
		if endpoint != nil {
			ep.Aliases = endpoint.Aliases
			aliases = append(aliases, endpoint.Aliases...)
		}
		c.Networks[net.Name] = ep
	}
	return aliases
}

// Tombstones keep the exit of removed containers for a while, so a wait on
// a container removed by --rm still reports its exit code.
func (e *Engine) bury(id string, ex *state.Exit) {
	e.mu.Lock()
	defer e.mu.Unlock()
	if e.tombstones == nil {
		e.tombstones = map[string]*state.Exit{}
	}
	e.tombstones[id] = ex
	time.AfterFunc(5*time.Minute, func() {
		e.mu.Lock()
		defer e.mu.Unlock()
		delete(e.tombstones, id)
	})
}

func (e *Engine) tombstone(id string) *state.Exit {
	e.mu.Lock()
	defer e.mu.Unlock()
	return e.tombstones[id]
}
