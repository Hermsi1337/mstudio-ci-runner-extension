package docker_test

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"log/slog"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/mittwald/mittwald-container-adapter/internal/docker"
	"github.com/mittwald/mittwald-container-adapter/internal/engine"
	"github.com/mittwald/mittwald-container-adapter/internal/fakeplatform"
	"github.com/mittwald/mittwald-container-adapter/internal/initproc"
	"github.com/mittwald/mittwald-container-adapter/internal/state"
)

// The test binary doubles as mstudio-init for the fake platform.
func TestMain(m *testing.M) {
	if self := os.Getenv("MSTUDIO_INIT_SELF"); self != "" {
		if err := initproc.Run(state.Dir(self)); err != nil {
			fmt.Fprintln(os.Stderr, err)
			os.Exit(1)
		}
		os.Exit(0)
	}
	os.Exit(m.Run())
}

type env struct {
	t        *testing.T
	platform *fakeplatform.Platform
	host     string
	stateDir string
}

func setup(t *testing.T) *env {
	t.Helper()
	if _, err := exec.LookPath("docker"); err != nil {
		t.Skip("docker CLI not installed")
	}
	stateDir := t.TempDir()
	platform := fakeplatform.New(os.Args[0])
	t.Cleanup(platform.Close)

	var dialer net.Dialer
	eng, err := engine.New(engine.Config{
		ProjectID:     "p-test",
		StackID:       "s-test",
		StateDir:      stateDir,
		StateHostPath: stateDir,
		ProjectHome:   "/home/p-test",
		StartTimeout:  20 * time.Second,
		Dial: func(ctx context.Context, network, address string) (net.Conn, error) {
			_, port, _ := net.SplitHostPort(address)
			return dialer.DialContext(ctx, network, net.JoinHostPort("127.0.0.1", port))
		},
		Logger: testLogger(),
	}, platform)
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	t.Cleanup(cancel)
	eng.Restore(ctx)

	server := httptest.NewServer(docker.NewRouter(docker.RouterConfig{
		Engine:          eng,
		ContainerClient: platform,
		ProjectID:       "p-test",
		StackID:         "s-test",
		Logger:          testLogger(),
	}))
	t.Cleanup(server.Close)
	return &env{t: t, platform: platform, host: "tcp://" + strings.TrimPrefix(server.URL, "http://"), stateDir: stateDir}
}

type result struct {
	stdout, stderr string
	code           int
}

func (e *env) docker(args ...string) result {
	e.t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()
	if os.Getenv("ADAPTER_TEST_LOG") != "" {
		args = append([]string{"--debug"}, args...)
	}
	cmd := exec.CommandContext(ctx, "docker", args...)
	cmd.Env = append(os.Environ(), "DOCKER_HOST="+e.host, "DOCKER_CONTEXT=", "DOCKER_CONFIG="+e.t.TempDir())
	var stdout, stderr bytes.Buffer
	cmd.Stdout, cmd.Stderr = &stdout, &stderr
	err := cmd.Run()
	code := 0
	if exitErr, ok := err.(*exec.ExitError); ok {
		code = exitErr.ExitCode()
	} else if err != nil {
		e.t.Fatalf("docker %v: %v", args, err)
	}
	return result{stdout: stdout.String(), stderr: stderr.String(), code: code}
}

func (e *env) mustDocker(args ...string) string {
	e.t.Helper()
	r := e.docker(args...)
	if r.code != 0 {
		e.t.Fatalf("docker %v exited %d\nstdout: %s\nstderr: %s", args, r.code, r.stdout, r.stderr)
	}
	return strings.TrimSpace(r.stdout)
}

func TestRunForwardsOutputAndExitCode(t *testing.T) {
	e := setup(t)
	r := e.docker("run", "--rm", "alpine", "sh", "-c", "echo hi; echo err >&2; exit 3")
	if r.code != 3 {
		t.Fatalf("exit code %d, want 3 (stderr %q)", r.code, r.stderr)
	}
	if r.stdout != "hi\n" || !strings.Contains(r.stderr, "err") {
		t.Fatalf("stdout %q stderr %q", r.stdout, r.stderr)
	}
	deadline := time.Now().Add(10 * time.Second)
	for time.Now().Before(deadline) {
		if e.mustDocker("ps", "-aq") == "" {
			return
		}
		time.Sleep(200 * time.Millisecond)
	}
	t.Fatalf("container with --rm is still there: %s", e.mustDocker("ps", "-a"))
}

func TestDetachedContainerLifecycle(t *testing.T) {
	e := setup(t)
	port := freePort(t)
	e.mustDocker("run", "-d", "--name", "web", "--label", "suite=cli", "-p", "8080",
		"alpine", "python3", "-m", "http.server", port, "--bind", "127.0.0.1")

	hostPort := e.mustDocker("inspect", "web", "--format", `{{(index (index .NetworkSettings.Ports "8080/tcp") 0).HostPort}}`)
	if hostPort == "" {
		t.Fatal("no host port published")
	}
	if got := e.mustDocker("ps", "--filter", "label=suite=cli", "--format", "{{.Names}}"); got != "web" {
		t.Fatalf("label filter returned %q", got)
	}

	exec := e.docker("exec", "web", "sh", "-c", "echo from-exec; exit 7")
	if exec.code != 7 || exec.stdout != "from-exec\n" {
		t.Fatalf("exec: code %d stdout %q stderr %q", exec.code, exec.stdout, exec.stderr)
	}

	target := t.TempDir()
	src := filepath.Join(t.TempDir(), "greeting.txt")
	_ = os.WriteFile(src, []byte("hello"), 0o644)
	e.mustDocker("cp", src, "web:"+target)
	if got := e.mustDocker("exec", "web", "cat", filepath.Join(target, "greeting.txt")); got != "hello" {
		t.Fatalf("copied file holds %q", got)
	}
	back := t.TempDir()
	e.mustDocker("cp", "web:"+filepath.Join(target, "greeting.txt"), back)
	if data, _ := os.ReadFile(filepath.Join(back, "greeting.txt")); string(data) != "hello" {
		t.Fatalf("copied back %q", data)
	}

	e.mustDocker("stop", "-t", "2", "web")
	if st := e.mustDocker("inspect", "web", "--format", "{{.State.Status}}"); st != "exited" {
		t.Fatalf("state after stop %q", st)
	}
	e.mustDocker("start", "web")
	if st := e.mustDocker("inspect", "web", "--format", "{{.State.Status}}"); st != "running" {
		t.Fatalf("state after start %q", st)
	}
	e.mustDocker("rm", "-f", "web")
	if r := e.docker("container", "inspect", "web"); r.code == 0 {
		t.Fatal("container still exists after rm")
	}
}

func TestPortForwardReachesContainer(t *testing.T) {
	e := setup(t)
	port := freePort(t)
	e.mustDocker("run", "-d", "--name", "srv", "-p", port, "alpine", "python3", "-m", "http.server", port, "--bind", "127.0.0.1")
	hostPort := e.mustDocker("port", "srv", port)
	_, published, _ := net.SplitHostPort(strings.Split(hostPort, "\n")[0])
	var resp *http.Response
	var err error
	for i := 0; i < 50; i++ {
		resp, err = http.Get("http://127.0.0.1:" + published + "/")
		if err == nil {
			break
		}
		time.Sleep(100 * time.Millisecond)
	}
	if err != nil {
		t.Fatalf("forwarded port not reachable: %v", err)
	}
	_ = resp.Body.Close()
	if resp.StatusCode != 200 {
		t.Fatalf("status %d", resp.StatusCode)
	}
	e.mustDocker("rm", "-f", "srv")
}

func TestLogsAndWait(t *testing.T) {
	e := setup(t)
	id := e.mustDocker("run", "-d", "alpine", "sh", "-c", "echo one; sleep 1; echo two >&2; exit 5")
	if code := e.mustDocker("wait", id); code != "5" {
		t.Fatalf("wait returned %q", code)
	}
	r := e.docker("logs", id)
	if r.stdout != "one\n" || r.stderr != "two\n" {
		t.Fatalf("logs stdout %q stderr %q", r.stdout, r.stderr)
	}
	if tail := e.docker("logs", "--tail", "1", id); tail.stdout != "" || tail.stderr != "two\n" {
		t.Fatalf("tail stdout %q stderr %q", tail.stdout, tail.stderr)
	}
}

func TestForeignServicesStayInvisible(t *testing.T) {
	e := setup(t)
	e.platform.AddForeignService("runner")
	if r := e.docker("rm", "runner"); r.code == 0 {
		t.Fatal("removing a foreign service succeeded")
	}
	if out := e.mustDocker("ps", "-a", "--format", "{{.Names}}"); out != "" {
		t.Fatalf("foreign service listed: %q", out)
	}
	if _, ok := e.platform.Service("runner"); !ok {
		t.Fatal("foreign service was removed")
	}
}

func testLogger() *slog.Logger {
	if os.Getenv("ADAPTER_TEST_LOG") != "" {
		return slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelDebug}))
	}
	return slog.New(slog.NewTextHandler(io.Discard, nil))
}

func freePort(t *testing.T) string {
	l, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = l.Close() }()
	_, port, _ := net.SplitHostPort(l.Addr().String())
	return port
}

func TestHealthCheck(t *testing.T) {
	e := setup(t)
	marker := filepath.Join(t.TempDir(), "ready")
	e.mustDocker("run", "-d", "--name", "hc", "--health-cmd", "test -f "+marker,
		"--health-interval", "1s", "--health-start-interval", "200ms", "--health-retries", "2",
		"alpine", "sleep", "60")
	status := func() string {
		return e.mustDocker("inspect", "hc", "--format", "{{.State.Health.Status}}")
	}
	if s := status(); s != "starting" {
		t.Fatalf("health %q before the check passed, want starting", s)
	}
	_ = os.WriteFile(marker, nil, 0o644)
	deadline := time.Now().Add(10 * time.Second)
	for status() != "healthy" {
		if time.Now().After(deadline) {
			t.Fatalf("health still %q", status())
		}
		time.Sleep(200 * time.Millisecond)
	}
	e.mustDocker("rm", "-f", "hc")
}
