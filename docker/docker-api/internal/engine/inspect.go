package engine

import (
	"context"
	"encoding/json"
	"fmt"
	"net/netip"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/mittwald/api-client-go/mittwaldv2/generated/schemas/containerv2"
	"github.com/moby/moby/api/types/container"
	"github.com/moby/moby/api/types/mount"
	"github.com/moby/moby/api/types/network"

	"github.com/hermsi1337/mstudio-ci-runner-extension/docker/docker-api/internal/state"
)

const zeroTime = "0001-01-01T00:00:00Z"

type observed struct {
	c       *state.Container
	status  state.Status
	state   container.ContainerState
	running bool
	message string
}

func (e *Engine) observe(ctx context.Context, c *state.Container, checkService bool) observed {
	dir := e.dir(c.ID)
	o := observed{c: c, status: dir.Status()}
	switch {
	case c.Virtual != "":
		if e.ryuk.running(c.ID) {
			o.state, o.running = container.StateRunning, true
		} else if o.status.Started() {
			o.state = container.StateExited
		} else {
			o.state = container.StateCreated
		}
	case !o.status.Started():
		o.state = container.StateCreated
	case o.status.Running():
		o.state, o.running = container.StateRunning, true
		if checkService && !dir.Alive() {
			if svc, err := e.service(ctx, c); err == nil && svc != nil && svc.Status != containerv2.ServiceStatusRunning {
				o.state, o.running = container.StateDead, false
				if svc.Message != nil {
					o.message = *svc.Message
				}
			}
		}
	default:
		o.state = container.StateExited
	}
	return o
}

func (e *Engine) Inspect(ctx context.Context, ref string) (*container.InspectResponse, error) {
	c, err := e.Resolve(ref)
	if err != nil {
		return nil, err
	}
	o := e.observe(ctx, c, true)
	st := &container.State{
		Status:     o.state,
		Running:    o.running,
		Dead:       o.state == container.StateDead,
		Error:      o.message,
		StartedAt:  zeroTime,
		FinishedAt: zeroTime,
	}
	if run := o.status.Run; run != nil {
		st.StartedAt = run.StartedAt.UTC().Format(time.RFC3339Nano)
		if o.running {
			st.Pid = run.Pid
		}
	}
	if ex := o.status.Exit; ex != nil && !o.running {
		st.ExitCode = ex.Code
		st.FinishedAt = ex.FinishedAt.UTC().Format(time.RFC3339Nano)
		if st.Error == "" {
			st.Error = ex.Error
		}
	}

	if c.Health != nil {
		st.Health = e.health(c, o)
	}
	ports := e.portMap(c)
	exposed := network.PortSet{}
	for p := range ports {
		exposed[p] = struct{}{}
	}
	var path string
	var args []string
	if len(c.Process.Args) > 0 {
		path, args = c.Process.Args[0], c.Process.Args[1:]
	}
	image := c.ImageDigest
	if image == "" {
		image = c.Image
	}
	return &container.InspectResponse{
		ID:       c.ID,
		Created:  c.Created.Format(time.RFC3339Nano),
		Path:     path,
		Args:     args,
		State:    st,
		Image:    image,
		Name:     "/" + c.Name,
		Driver:   "overlay2",
		Platform: "linux",
		HostConfig: &container.HostConfig{
			NetworkMode:   container.NetworkMode(e.networkMode(c)),
			PortBindings:  ports,
			AutoRemove:    c.AutoRemove,
			RestartPolicy: container.RestartPolicy{Name: container.RestartPolicyDisabled},
		},
		Mounts: mountPoints(c.Volumes),
		Config: &container.Config{
			Hostname:     c.ServiceName,
			User:         c.Process.User,
			ExposedPorts: exposed,
			Tty:          c.Process.Tty,
			Env:          append(append([]string{}, c.ImageEnv...), c.Process.Env...),
			Cmd:          c.Cmd,
			Image:        c.Image,
			WorkingDir:   c.Process.WorkingDir,
			Entrypoint:   c.Entrypoint,
			Labels:       nonNil(c.Labels),
			StopSignal:   c.StopSignal,
			StopTimeout:  c.StopTimeout,
		},
		NetworkSettings: &container.NetworkSettings{
			Ports:    ports,
			Networks: e.endpoints(ctx, c, o.running),
		},
	}, nil
}

func nonNil(m map[string]string) map[string]string {
	if m == nil {
		return map[string]string{}
	}
	return m
}

func (e *Engine) portMap(c *state.Container) network.PortMap {
	ports := network.PortMap{}
	for spec, hostPort := range c.Ports {
		p, err := network.ParsePort(spec)
		if err != nil {
			continue
		}
		if hostPort == "" {
			ports[p] = nil
			continue
		}
		ports[p] = []network.PortBinding{{HostIP: netip.IPv4Unspecified(), HostPort: hostPort}}
	}
	return ports
}

func (e *Engine) networkMode(c *state.Container) string {
	if c.NetworkMode != "" {
		return c.NetworkMode
	}
	return "bridge"
}

func (e *Engine) endpoints(ctx context.Context, c *state.Container, running bool) map[string]*network.EndpointSettings {
	var ip netip.Addr
	if running && c.Virtual == "" {
		ip, _ = netip.ParseAddr(e.containerIP(c))
	}
	endpoints := map[string]*network.EndpointSettings{}
	names := map[string]state.Endpoint{}
	for name, ep := range c.Networks {
		names[name] = ep
	}
	if len(names) == 0 {
		names[e.networkMode(c)] = state.Endpoint{NetworkID: bridgeID}
	}
	for name, ep := range names {
		settings := &network.EndpointSettings{
			NetworkID:  ep.NetworkID,
			EndpointID: c.ID,
			Aliases:    ep.Aliases,
			DNSNames:   append([]string{c.ServiceName}, ep.Aliases...),
		}
		if ip.IsValid() {
			settings.IPAddress = ip
			settings.IPPrefixLen = 32
		}
		endpoints[name] = settings
	}
	return endpoints
}

func mountPoints(volumes []string) []container.MountPoint {
	points := make([]container.MountPoint, 0, len(volumes))
	for _, v := range volumes {
		source, target, _ := strings.Cut(v, ":")
		mp := container.MountPoint{Source: source, Destination: target, RW: true}
		if strings.HasPrefix(source, "/") {
			mp.Type = mount.TypeBind
		} else {
			mp.Type = mount.TypeVolume
			mp.Name = source
		}
		points = append(points, mp)
	}
	return points
}

// Filters accepts both encodings Docker clients send: {"label":["a=b"]} and
// {"label":{"a=b":true}}.
type Filters map[string][]string

func ParseFilters(raw string) (Filters, error) {
	if raw == "" {
		return Filters{}, nil
	}
	var generic map[string]json.RawMessage
	if err := json.Unmarshal([]byte(raw), &generic); err != nil {
		return nil, fmt.Errorf("%w: invalid filters: %v", ErrInvalid, err)
	}
	f := Filters{}
	for key, value := range generic {
		var list []string
		if json.Unmarshal(value, &list) == nil {
			f[key] = list
			continue
		}
		var set map[string]bool
		if err := json.Unmarshal(value, &set); err != nil {
			return nil, fmt.Errorf("%w: invalid filter %s", ErrInvalid, key)
		}
		for v, on := range set {
			if on {
				f[key] = append(f[key], v)
			}
		}
	}
	return f, nil
}

func (f Filters) match(o observed) bool {
	c := o.c
	// Several label filters must all match, as in dockerd; Docker Compose
	// selects a service by project label and service label together.
	if labels, ok := f["label"]; ok && !matchLabels(c.Labels, labels) {
		return false
	}
	for key, values := range f {
		if key == "label" {
			continue
		}
		ok := false
		for _, v := range values {
			switch key {
			case "id":
				ok = strings.HasPrefix(c.ID, v)
			case "name":
				re, err := regexp.Compile(strings.TrimPrefix(v, "/"))
				ok = err == nil && re.MatchString(c.Name)
			case "status":
				ok = string(o.state) == v
			case "ancestor":
				ok = c.Image == v || strings.HasPrefix(c.Image, v+":")
			case "network":
				_, ok = c.Networks[v]
			default:
				ok = true
			}
			if ok {
				break
			}
		}
		if !ok {
			return false
		}
	}
	return true
}

func (e *Engine) List(ctx context.Context, all bool, limit int, filters Filters) []container.Summary {
	var list []container.Summary
	for _, c := range e.containers() {
		o := e.observe(ctx, c, false)
		if !all && !o.running {
			continue
		}
		if !filters.match(o) {
			continue
		}
		list = append(list, e.summary(ctx, o))
		if limit > 0 && len(list) >= limit {
			break
		}
	}
	if list == nil {
		list = []container.Summary{}
	}
	return list
}

func (e *Engine) summary(ctx context.Context, o observed) container.Summary {
	c := o.c
	var ports []container.PortSummary
	for spec, hostPort := range c.Ports {
		p, err := network.ParsePort(spec)
		if err != nil {
			continue
		}
		ps := container.PortSummary{PrivatePort: p.Num(), Type: string(p.Proto())}
		if n, err := strconv.Atoi(hostPort); err == nil {
			ps.PublicPort = uint16(n)
			ps.IP = netip.IPv4Unspecified()
		}
		ports = append(ports, ps)
	}
	status := "Created"
	switch o.state {
	case container.StateRunning:
		status = "Up " + humanDuration(time.Since(o.status.Run.StartedAt))
	case container.StateExited:
		if ex := o.status.Exit; ex != nil {
			status = fmt.Sprintf("Exited (%d) %s ago", ex.Code, humanDuration(time.Since(ex.FinishedAt)))
		}
	case container.StateDead:
		status = "Dead"
	}
	s := container.Summary{
		ID:      c.ID,
		Names:   []string{"/" + c.Name},
		Image:   c.Image,
		ImageID: c.ImageDigest,
		Command: strings.Join(c.Process.Args, " "),
		Created: c.Created.Unix(),
		Ports:   ports,
		Labels:  nonNil(c.Labels),
		State:   o.state,
		Status:  status,
		NetworkSettings: &container.NetworkSettingsSummary{
			Networks: e.endpoints(ctx, c, false),
		},
		Mounts: mountPoints(c.Volumes),
	}
	s.HostConfig.NetworkMode = e.networkMode(c)
	return s
}

func humanDuration(d time.Duration) string {
	switch {
	case d < time.Second:
		return "Less than a second"
	case d < time.Minute:
		return fmt.Sprintf("%d seconds", int(d.Seconds()))
	case d < 2*time.Minute:
		return "About a minute"
	case d < time.Hour:
		return fmt.Sprintf("%d minutes", int(d.Minutes()))
	case d < 2*time.Hour:
		return "About an hour"
	case d < 48*time.Hour:
		return fmt.Sprintf("%d hours", int(d.Hours()))
	}
	return fmt.Sprintf("%d days", int(d.Hours()/24))
}

func (e *Engine) health(c *state.Container, o observed) *container.Health {
	h := &container.Health{Status: container.Starting, Log: []*container.HealthcheckResult{}}
	recorded, err := e.dir(c.ID).Health()
	if err != nil || recorded.Generation != o.status.Generation() {
		return h
	}
	h.Status = container.HealthStatus(recorded.Status)
	h.FailingStreak = recorded.FailingStreak
	for _, r := range recorded.Log {
		h.Log = append(h.Log, &container.HealthcheckResult{Start: r.Start, End: r.End, ExitCode: r.ExitCode, Output: r.Output})
	}
	if !o.running {
		h.Status = container.Unhealthy
	}
	return h
}
