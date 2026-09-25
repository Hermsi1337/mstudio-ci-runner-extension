package engine

import (
	"bufio"
	"context"
	"fmt"
	"net"
	"net/url"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/mittwald/mittwald-container-adapter/internal/state"
)

// Testcontainers starts Ryuk, a container that removes everything a test
// session created once the session disconnects. Ryuk needs the Docker socket,
// which does not exist here, so the engine plays Ryuk itself: the container is
// virtual, its port is served by the adapter and the cleanup runs in-process.

const (
	virtualRyuk       = "ryuk"
	ryukReconnectWait = 10 * time.Second
)

func isRyukImage(image string) bool {
	name := strings.Split(image, "@")[0]
	if i := strings.LastIndex(name, ":"); i > strings.LastIndex(name, "/") {
		name = name[:i]
	}
	return strings.HasSuffix(name, "testcontainers/ryuk")
}

type ryukServer struct {
	e         *Engine
	mu        sync.Mutex
	instances map[string]*ryukInstance
}

type ryukInstance struct {
	listener net.Listener
	conns    int
	filters  []Filters
	timer    *time.Timer
	pruned   bool
}

func newRyukServer(e *Engine) *ryukServer {
	return &ryukServer{e: e, instances: map[string]*ryukInstance{}}
}

func (r *ryukServer) running(id string) bool {
	r.mu.Lock()
	defer r.mu.Unlock()
	_, ok := r.instances[id]
	return ok
}

func (r *ryukServer) start(c *state.Container) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	if _, ok := r.instances[c.ID]; ok {
		return ErrNotModified
	}
	l, err := net.Listen("tcp", ":"+c.Ports["8080/tcp"])
	if err != nil {
		l, err = net.Listen("tcp", ":0")
	}
	if err != nil {
		return err
	}
	c.Ports["8080/tcp"] = strconv.Itoa(l.Addr().(*net.TCPAddr).Port)
	if err := r.e.save(c); err != nil {
		_ = l.Close()
		return err
	}
	inst := &ryukInstance{listener: l}
	r.instances[c.ID] = inst
	dir := r.e.dir(c.ID)
	generation := dir.Status().Generation() + 1
	_ = state.WriteJSON(dir.RunPath(), state.Run{Generation: generation, StartedAt: time.Now()})
	if f, err := os.OpenFile(dir.LogPath(), os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o666); err == nil {
		w := state.NewFrameWriter(f)
		now := time.Now()
		_ = w.Write(state.Stdout, []byte(now.Format("2006/01/02 15:04:05")+" Started!\n"))
		_ = w.Write(state.Stdout, []byte(fmt.Sprintf("time=%s level=INFO msg=started address=[::]:8080 emulated_by=mstudio-docker-adapter\n", now.Format(time.RFC3339))))
		_ = f.Close()
	}
	go r.serve(c, inst)
	r.e.log.Info("ryuk emulation started", "container", c.ID[:12], "port", c.Ports["8080/tcp"])
	return nil
}

func (r *ryukServer) serve(c *state.Container, inst *ryukInstance) {
	for {
		conn, err := inst.listener.Accept()
		if err != nil {
			return
		}
		r.mu.Lock()
		inst.conns++
		if inst.timer != nil {
			inst.timer.Stop()
			inst.timer = nil
		}
		r.mu.Unlock()
		go r.handle(c, inst, conn)
	}
}

func (r *ryukServer) handle(c *state.Container, inst *ryukInstance, conn net.Conn) {
	defer func() { _ = conn.Close() }()
	scanner := bufio.NewScanner(conn)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}
		query, err := url.ParseQuery(line)
		if err != nil {
			_, _ = conn.Write([]byte("ERROR\n"))
			continue
		}
		r.mu.Lock()
		inst.filters = append(inst.filters, Filters(query))
		r.mu.Unlock()
		_, _ = conn.Write([]byte("ACK\n"))
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	inst.conns--
	if inst.conns == 0 && !inst.pruned {
		inst.timer = time.AfterFunc(ryukReconnectWait, func() { r.prune(c, inst) })
	}
}

func (r *ryukServer) prune(ryuk *state.Container, inst *ryukInstance) {
	r.mu.Lock()
	if inst.conns > 0 || inst.pruned {
		r.mu.Unlock()
		return
	}
	inst.pruned = true
	filters := append([]Filters{}, inst.filters...)
	r.mu.Unlock()

	ctx := context.Background()
	removed := 0
	for _, c := range r.e.containers() {
		if c.ID == ryuk.ID {
			continue
		}
		o := observed{c: c}
		for _, f := range filters {
			if f.match(o) {
				if err := r.e.remove(ctx, c, true); err != nil {
					r.e.log.Warn("ryuk emulation could not remove container", "container", c.ID[:12], "error", err)
				} else {
					removed++
				}
				break
			}
		}
	}
	for _, n := range r.e.Networks() {
		for _, f := range filters {
			if labels, ok := f["label"]; ok && matchLabels(n.Labels, labels) {
				_ = r.e.RemoveNetwork(n.ID)
				break
			}
		}
	}
	r.e.log.Info("ryuk emulation pruned the session", "containers", removed)
	_ = r.e.remove(ctx, ryuk, true)
}

func matchLabels(have map[string]string, want []string) bool {
	if len(want) == 0 {
		return false
	}
	for _, w := range want {
		k, v, hasValue := strings.Cut(w, "=")
		got, ok := have[k]
		if !ok || (hasValue && got != v) {
			return false
		}
	}
	return true
}

func (r *ryukServer) stop(c *state.Container) error {
	r.mu.Lock()
	inst, ok := r.instances[c.ID]
	delete(r.instances, c.ID)
	r.mu.Unlock()
	if !ok {
		return ErrNotModified
	}
	_ = inst.listener.Close()
	if inst.timer != nil {
		inst.timer.Stop()
	}
	dir := r.e.dir(c.ID)
	_ = state.WriteJSON(dir.ExitPath(), state.Exit{Generation: dir.Status().Generation(), FinishedAt: time.Now()})
	return nil
}
