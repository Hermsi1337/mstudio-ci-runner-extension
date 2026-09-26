// Package initproc is mstudio-init, the first process of every container the
// adapter runs. It starts the process of the container, records its output and
// exit code, applies uploaded archives and runs exec requests. After the
// process ends the wrapper stays alive, because the platform restarts every
// container that exits, whatever its restart policy says, and a Docker
// container that exited must stay exited.
package initproc

import (
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"strings"
	"sync"
	"syscall"
	"time"

	"golang.org/x/sys/unix"

	"github.com/hermsi1337/mstudio-ci-runner-extension/docker/docker-api/internal/state"
	"github.com/hermsi1337/mstudio-ci-runner-extension/docker/docker-api/internal/tarutil"
)

const (
	pollInterval      = 100 * time.Millisecond
	heartbeatInterval = 2 * time.Second
	outputDrain       = 15 * time.Second
	shutdownGrace     = 10 * time.Second
)

type Init struct {
	dir       state.Dir
	container *state.Container
	log       *state.FrameWriter
	reaper    *reaper

	mu         sync.Mutex
	main       *process
	generation int
	tasks      map[string]bool
}

func Run(dir state.Dir) error {
	return RunContext(context.Background(), dir)
}

// RunContext runs the wrapper until ctx ends or the container is told to stop.
func RunContext(ctx context.Context, dir state.Dir) error {
	container, err := dir.Container()
	if err != nil {
		return fmt.Errorf("read container config: %w", err)
	}
	logFile, err := os.OpenFile(dir.LogPath(), os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o666)
	if err != nil {
		return fmt.Errorf("open log: %w", err)
	}
	defer func() { _ = logFile.Close() }()

	in := &Init{
		dir:       dir,
		container: container,
		log:       state.NewFrameWriter(logFile),
		reaper:    newReaper(),
		tasks:     map[string]bool{},
	}
	return in.loop(ctx)
}

func (in *Init) loop(parent context.Context) error {
	ctx, cancel := context.WithCancel(parent)
	defer cancel()
	go in.heartbeat(ctx)
	if string(in.dir) == state.SelfDir {
		// Once before the process starts, so a container that resolves a
		// sibling right away finds it; then in the background.
		original := in.readEtcHosts()
		in.applyHosts(original, nil)
		go in.syncHosts(ctx, original)
	}
	// The reaper outlives ctx: shutdown still waits for the process to end.
	reaperCtx, stopReaper := context.WithCancel(context.Background())
	defer stopReaper()
	go in.reaper.run(reaperCtx)

	terminate := make(chan os.Signal, 1)
	signal.Notify(terminate, syscall.SIGTERM, syscall.SIGINT)
	defer signal.Stop(terminate)

	status := in.dir.Status()
	in.generation = status.Generation()
	switch {
	case status.Running():
		in.logf("the previous run of generation %d ended with the container, marking it as exited", in.generation)
		in.writeExit(in.generation, 137, "the platform replaced the container while the process was running")
	case !status.Started():
		in.start()
	}

	ticker := time.NewTicker(pollInterval)
	defer ticker.Stop()
	for {
		select {
		case sig := <-terminate:
			in.shutdown(sig)
			return nil
		case <-ctx.Done():
			in.shutdown(syscall.SIGTERM)
			return nil
		case <-ticker.C:
			in.handleControls()
			in.handleArchives()
			in.handleTasks()
		}
	}
}

func (in *Init) heartbeat(ctx context.Context) {
	path := in.dir.HeartbeatPath()
	for {
		now := time.Now()
		if err := os.Chtimes(path, now, now); err != nil {
			_ = os.WriteFile(path, nil, 0o666)
		}
		select {
		case <-ctx.Done():
			return
		case <-time.After(heartbeatInterval):
		}
	}
}

func (in *Init) start() {
	in.mu.Lock()
	defer in.mu.Unlock()
	if in.main != nil {
		return
	}
	in.handleArchives()
	in.generation++
	generation := in.generation

	stdin := in.dir.Stdin()
	p, err := in.spawn(in.container.Process, nil, in.log, true, &stdin)
	if err != nil {
		in.logf("starting %v failed: %v", in.container.Process.Args, err)
		_ = state.WriteJSON(in.dir.RunPath(), state.Run{Generation: generation, StartedAt: time.Now()})
		in.writeExit(generation, 127, err.Error())
		return
	}
	in.main = p
	_ = state.WriteJSON(in.dir.RunPath(), state.Run{Generation: generation, StartedAt: time.Now(), Pid: p.pid, IPs: localIPs()})
	healthCtx, stopHealth := context.WithCancel(context.Background())
	go in.runHealth(healthCtx, generation)
	go func() {
		code := p.wait()
		stopHealth()
		in.mu.Lock()
		in.main = nil
		in.mu.Unlock()
		in.writeExit(generation, code, "")
	}()
}

func (in *Init) writeExit(generation, code int, message string) {
	_ = state.WriteJSON(in.dir.ExitPath(), state.Exit{
		Generation: generation,
		Code:       code,
		FinishedAt: time.Now(),
		Error:      message,
	})
}

func (in *Init) signalMain(name string) {
	sig, err := parseSignal(name)
	if err != nil {
		in.logf("%v", err)
		return
	}
	in.mu.Lock()
	p := in.main
	in.mu.Unlock()
	if p != nil {
		_ = syscall.Kill(-p.pid, sig)
	}
}

func (in *Init) shutdown(sig os.Signal) {
	in.mu.Lock()
	p := in.main
	in.mu.Unlock()
	if p == nil {
		return
	}
	_ = syscall.Kill(-p.pid, sig.(syscall.Signal))
	select {
	case <-p.done:
	case <-time.After(shutdownGrace):
		_ = syscall.Kill(-p.pid, syscall.SIGKILL)
		<-p.done
	}
	time.Sleep(200 * time.Millisecond)
}

func (in *Init) handleControls() {
	for _, path := range state.Pending(in.dir.ControlDir(), ".json") {
		var c state.Control
		err := state.ReadJSON(path, &c)
		_ = os.Remove(path)
		if err != nil {
			continue
		}
		switch c.Action {
		case "start":
			in.start()
		case "signal":
			in.signalMain(c.Signal)
		}
	}
}

func (in *Init) handleArchives() {
	for _, path := range state.Pending(in.dir.ArchiveDir(), ".json") {
		var req state.ArchiveRequest
		if err := state.ReadJSON(path, &req); err != nil {
			continue
		}
		base := strings.TrimSuffix(path, ".json")
		tarPath := filepath.Join(in.dir.ArchiveDir(), filepath.Base(req.Tar))
		err := extractFile(tarPath, req.Path)
		_ = os.Remove(tarPath)
		_ = os.Remove(path)
		if err != nil {
			_ = os.WriteFile(base+".error", []byte(err.Error()), 0o666)
			continue
		}
		_ = os.WriteFile(base+".done", nil, 0o666)
	}
}

func extractFile(tarPath, dir string) error {
	f, err := os.Open(tarPath)
	if err != nil {
		return err
	}
	defer func() { _ = f.Close() }()
	return tarutil.Extract(f, dir)
}

func (in *Init) handleTasks() {
	entries, err := os.ReadDir(in.dir.TaskDir())
	if err != nil {
		return
	}
	for _, e := range entries {
		if !e.IsDir() || in.tasks[e.Name()] {
			continue
		}
		task := state.Task(filepath.Join(in.dir.TaskDir(), e.Name()))
		if err := os.Rename(task.RequestPath(), task.ClaimedPath()); err != nil {
			continue
		}
		in.tasks[e.Name()] = true
		var req state.TaskRequest
		if err := state.ReadJSON(task.ClaimedPath(), &req); err != nil {
			_ = state.WriteJSON(task.ResultPath(), state.TaskResult{Code: 126, Error: err.Error()})
			continue
		}
		go in.runTask(task, req)
	}
}

func (in *Init) runTask(task state.Task, req state.TaskRequest) {
	result := state.TaskResult{}
	switch req.Type {
	case state.TaskExec:
		result = in.exec(task, req)
	case state.TaskStat:
		stat, err := tarutil.Stat(req.Path)
		result = pathResult(stat, err)
	case state.TaskArchiveGet:
		stat, err := tarutil.Stat(req.Path)
		result = pathResult(stat, err)
		if err == nil {
			if err := packFile(req.Path, task.ArchivePath()); err != nil {
				result = state.TaskResult{Code: 1, Error: err.Error()}
			}
		}
	default:
		result = state.TaskResult{Code: 126, Error: "unknown task " + req.Type}
	}
	_ = state.WriteJSON(task.ResultPath(), result)
}

func pathResult(stat *state.PathStat, err error) state.TaskResult {
	if errors.Is(err, os.ErrNotExist) {
		return state.TaskResult{Code: 1, NotFound: true, Error: err.Error()}
	}
	if err != nil {
		return state.TaskResult{Code: 1, Error: err.Error()}
	}
	return state.TaskResult{Stat: stat}
}

func packFile(path, target string) error {
	f, err := os.OpenFile(target, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o666)
	if err != nil {
		return err
	}
	if err := tarutil.Pack(path, f); err != nil {
		_ = f.Close()
		return err
	}
	return f.Close()
}

func (in *Init) exec(task state.Task, req state.TaskRequest) state.TaskResult {
	if req.Process == nil || len(req.Process.Args) == 0 {
		return state.TaskResult{Code: 126, Error: "exec without a command"}
	}
	out, err := os.OpenFile(task.OutputPath(), os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o666)
	if err != nil {
		return state.TaskResult{Code: 126, Error: err.Error()}
	}
	defer func() { _ = out.Close() }()

	proc := *req.Process
	if proc.WorkingDir == "" {
		proc.WorkingDir = in.container.Process.WorkingDir
	}
	if proc.User == "" {
		proc.User = in.container.Process.User
	}
	stdin := task.Stdin()
	p, err := in.spawn(proc, in.container.Process.Env, state.NewFrameWriter(out), false, &stdin)
	if err != nil {
		return state.TaskResult{Code: 126, Error: err.Error()}
	}
	_ = state.WriteJSON(task.StartedPath(), state.TaskResult{Pid: p.pid})
	return state.TaskResult{Code: p.wait(), Pid: p.pid}
}

func (in *Init) logf(format string, args ...any) {
	_, _ = fmt.Fprintf(os.Stderr, "[mstudio-init] "+format+"\n", args...)
}

// process is a child of the wrapper. Its exit status arrives through the
// reaper, because the wrapper is PID 1 and has to reap orphans as well.
type process struct {
	pid   int
	group bool
	code  int
	done  chan struct{}
	pumps sync.WaitGroup
}

func (p *process) wait() int {
	<-p.done
	return p.code
}

// spawn starts a process. The main process of the container mirrors its
// output to the container log and gets a process group of its own, so
// signals reach every process it started, as they do in a Docker container.
func (in *Init) spawn(proc state.Process, baseEnv []string, out *state.FrameWriter, main bool, stdin *state.StdinFiles) (*process, error) {
	env := mergeEnv(os.Environ(), baseEnv, proc.Env)
	path, err := lookPath(proc.Args[0], env)
	if err != nil {
		return nil, err
	}
	cmd := exec.Command(path, proc.Args[1:]...)
	cmd.Args[0] = proc.Args[0]
	cmd.Env = env
	if proc.WorkingDir != "" {
		_ = os.MkdirAll(proc.WorkingDir, 0o755)
		cmd.Dir = proc.WorkingDir
	}
	if proc.User != "" {
		cred, err := lookupUser(proc.User)
		if err != nil {
			return nil, err
		}
		cmd.SysProcAttr = &syscall.SysProcAttr{Credential: cred}
	}
	if main {
		if cmd.SysProcAttr == nil {
			cmd.SysProcAttr = &syscall.SysProcAttr{}
		}
		cmd.SysProcAttr.Setpgid = true
	}
	devnull, err := os.Open(os.DevNull)
	if err != nil {
		return nil, err
	}
	defer func() { _ = devnull.Close() }()
	cmd.Stdin = devnull
	var stdinW *os.File
	if proc.Stdin && stdin != nil {
		stdinR, w, err := os.Pipe()
		if err != nil {
			return nil, err
		}
		defer func() { _ = stdinR.Close() }()
		cmd.Stdin = stdinR
		stdinW = w
	}
	stdoutR, stdoutW, err := os.Pipe()
	if err != nil {
		return nil, err
	}
	stderrR, stderrW, err := os.Pipe()
	if err != nil {
		return nil, err
	}
	cmd.Stdout = stdoutW
	cmd.Stderr = stderrW

	p := &process{done: make(chan struct{}), group: main}
	// Before the start: the reaper may wait for the pumps as soon as the
	// process is watched, and a process can end right away.
	p.pumps.Add(2)
	in.reaper.mu.Lock()
	err = cmd.Start()
	if err == nil {
		p.pid = cmd.Process.Pid
		in.reaper.watch(p)
	}
	in.reaper.mu.Unlock()
	_ = stdoutW.Close()
	_ = stderrW.Close()
	if err != nil {
		_ = stdoutR.Close()
		_ = stderrR.Close()
		p.pumps.Add(-2)
		return nil, err
	}

	var stdoutMirror, stderrMirror io.Writer
	if main {
		stdoutMirror, stderrMirror = os.Stdout, os.Stderr
	}
	if stdinW != nil {
		go stdin.Feed(stdinW, p.done)
	}
	go func() { defer p.pumps.Done(); out.Pump(state.Stdout, stdoutR, stdoutMirror); _ = stdoutR.Close() }()
	go func() { defer p.pumps.Done(); out.Pump(state.Stderr, stderrR, stderrMirror); _ = stderrR.Close() }()
	return p, nil
}

// reaper collects the exit status of every child, including orphans that were
// reparented to the wrapper.
type reaper struct {
	mu      sync.Mutex
	pending map[int]*process
}

func newReaper() *reaper {
	return &reaper{pending: map[int]*process{}}
}

func (r *reaper) watch(p *process) {
	r.pending[p.pid] = p
}

func (r *reaper) run(ctx context.Context) {
	sigchld := make(chan os.Signal, 16)
	signal.Notify(sigchld, syscall.SIGCHLD)
	ticker := time.NewTicker(time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-sigchld:
		case <-ticker.C:
		}
		r.reap()
	}
}

func (r *reaper) reap() {
	for {
		var status syscall.WaitStatus
		r.mu.Lock()
		pid, err := syscall.Wait4(-1, &status, syscall.WNOHANG, nil)
		if err != nil || pid <= 0 {
			r.mu.Unlock()
			return
		}
		p := r.pending[pid]
		delete(r.pending, pid)
		r.mu.Unlock()
		if p == nil {
			continue
		}
		p.code = exitCode(status)
		// When the main process ends, a Docker container ends with every
		// process in it. Leftovers such as nginx workers would otherwise keep
		// the output pipes open and delay the exit.
		if p.group {
			_ = syscall.Kill(-p.pid, syscall.SIGKILL)
		}
		go func() {
			drained := make(chan struct{})
			go func() { p.pumps.Wait(); close(drained) }()
			select {
			case <-drained:
			case <-time.After(outputDrain):
			}
			close(p.done)
		}()
	}
}

func killProcess(pid int) error {
	return syscall.Kill(pid, syscall.SIGKILL)
}

func exitCode(status syscall.WaitStatus) int {
	if status.Signaled() {
		return 128 + int(status.Signal())
	}
	return status.ExitStatus()
}

func parseSignal(name string) (syscall.Signal, error) {
	if name == "" {
		return syscall.SIGKILL, nil
	}
	var n int
	if _, err := fmt.Sscanf(name, "%d", &n); err == nil && n > 0 {
		return syscall.Signal(n), nil
	}
	upper := strings.ToUpper(name)
	if !strings.HasPrefix(upper, "SIG") {
		upper = "SIG" + upper
	}
	sig := unix.SignalNum(upper)
	if sig == 0 {
		return 0, fmt.Errorf("unknown signal %q", name)
	}
	return sig, nil
}

// ParseSignal is exported for the adapter, which validates signals before it
// hands them to the wrapper.
func ParseSignal(name string) (syscall.Signal, error) {
	return parseSignal(name)
}
