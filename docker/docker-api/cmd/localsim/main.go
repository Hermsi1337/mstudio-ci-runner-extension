// localsim serves the Docker API on this machine with a fake platform behind
// it: every container runs its command as a local process under
// mstudio-init. The image is ignored. It exists to try Docker clients such as
// Testcontainers against the adapter without a mittwald project.
package main

import (
	"context"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"

	"github.com/hermsi1337/mstudio-ci-runner-extension/docker/docker-api/internal/docker"
	"github.com/hermsi1337/mstudio-ci-runner-extension/docker/docker-api/internal/engine"
	"github.com/hermsi1337/mstudio-ci-runner-extension/docker/docker-api/internal/fakeplatform"
	"github.com/hermsi1337/mstudio-ci-runner-extension/docker/docker-api/internal/initproc"
	"github.com/hermsi1337/mstudio-ci-runner-extension/docker/docker-api/internal/state"
)

func main() {
	if self := os.Getenv("MSTUDIO_INIT_SELF"); self != "" {
		if err := initproc.Run(state.Dir(self)); err != nil {
			fmt.Fprintln(os.Stderr, err)
			os.Exit(1)
		}
		return
	}
	addr := "127.0.0.1:2375"
	if len(os.Args) > 1 {
		addr = os.Args[1]
	}
	stateDir, err := os.MkdirTemp("", "localsim-")
	if err != nil {
		panic(err)
	}
	self, _ := os.Executable()
	platform := fakeplatform.New(self)
	logger := slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelDebug}))

	var dialer net.Dialer
	eng, err := engine.New(engine.Config{
		ProjectID:     "p-local",
		StackID:       "s-local",
		StateDir:      stateDir,
		StateHostPath: stateDir,
		ProjectHome:   filepath.Dir(stateDir),
		Dial: func(ctx context.Context, network, address string) (net.Conn, error) {
			_, port, _ := net.SplitHostPort(address)
			return dialer.DialContext(ctx, network, net.JoinHostPort("127.0.0.1", port))
		},
		Logger: logger,
	}, platform)
	if err != nil {
		panic(err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	eng.Restore(ctx)

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)
	go func() {
		<-stop
		cancel()
		platform.Close()
		_ = os.RemoveAll(stateDir)
		os.Exit(0)
	}()

	logger.Info("local simulation listening", "addr", addr, "state", stateDir)
	err = http.ListenAndServe(addr, docker.NewRouter(docker.RouterConfig{
		Engine:          eng,
		ContainerClient: platform,
		ProjectID:       "p-local",
		StackID:         "s-local",
		Logger:          logger,
	}))
	fmt.Fprintln(os.Stderr, err)
}
