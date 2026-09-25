package engine

import (
	"context"
	"io"
	"log/slog"
	"net"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/hermsi1337/mstudio-ci-runner-extension/docker/docker-api/internal/state"
)

// forwarder publishes container ports on the adapter. Docker clients connect
// to the host in DOCKER_HOST and the published port; the forwarder relays to
// the service, which the stack network resolves by its name. Only TCP.
type forwarder struct {
	log  *slog.Logger
	dial func(ctx context.Context, network, address string) (net.Conn, error)

	mu        sync.Mutex
	listeners map[string]map[string]net.Listener
}

func newForwarder(log *slog.Logger, dial func(ctx context.Context, network, address string) (net.Conn, error)) *forwarder {
	return &forwarder{log: log, dial: dial, listeners: map[string]map[string]net.Listener{}}
}

// open listens for every TCP port of c that is not forwarded yet and writes
// the chosen host ports into c.Ports. host names the container at the time
// of each connection.
func (f *forwarder) open(c *state.Container, host func() string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.listeners[c.ID] == nil {
		f.listeners[c.ID] = map[string]net.Listener{}
	}
	var firstErr error
	for spec, hostPort := range c.Ports {
		port, proto, _ := strings.Cut(spec, "/")
		if proto != "" && proto != "tcp" {
			continue
		}
		if _, ok := f.listeners[c.ID][spec]; ok {
			continue
		}
		l, err := net.Listen("tcp", ":"+hostPort)
		if err != nil && hostPort != "" {
			f.log.Warn("requested host port is taken, picking another", "port", hostPort, "error", err)
			l, err = net.Listen("tcp", ":0")
		}
		if err != nil {
			if firstErr == nil {
				firstErr = err
			}
			continue
		}
		c.Ports[spec] = strconv.Itoa(l.Addr().(*net.TCPAddr).Port)
		f.listeners[c.ID][spec] = l
		go f.serve(l, host, port)
		f.log.Debug("port forward opened", "container", c.ID[:12], "port", spec, "hostPort", c.Ports[spec])
	}
	return firstErr
}

func (f *forwarder) serve(l net.Listener, host func() string, port string) {
	for {
		conn, err := l.Accept()
		if err != nil {
			return
		}
		go f.relay(conn, net.JoinHostPort(host(), port))
	}
}

func (f *forwarder) relay(client net.Conn, target string) {
	defer func() { _ = client.Close() }()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	upstream, err := f.dial(ctx, "tcp", target)
	cancel()
	if err != nil {
		f.log.Debug("port forward dial failed", "target", target, "error", err)
		return
	}
	defer func() { _ = upstream.Close() }()
	done := make(chan struct{}, 2)
	pipe := func(dst, src net.Conn) {
		_, _ = io.Copy(dst, src)
		if tcp, ok := dst.(interface{ CloseWrite() error }); ok {
			_ = tcp.CloseWrite()
		}
		done <- struct{}{}
	}
	go pipe(upstream, client)
	go pipe(client, upstream)
	<-done
	<-done
}

func (f *forwarder) close(id string) {
	f.mu.Lock()
	defer f.mu.Unlock()
	for _, l := range f.listeners[id] {
		_ = l.Close()
	}
	delete(f.listeners, id)
}
