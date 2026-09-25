package initproc_test

import (
	"archive/tar"
	"bytes"
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/hermsi1337/mstudio-ci-runner-extension/docker/docker-api/internal/initproc"
	"github.com/hermsi1337/mstudio-ci-runner-extension/docker/docker-api/internal/state"
)

func prepare(t *testing.T, proc state.Process) state.Dir {
	t.Helper()
	dir := state.Dir(t.TempDir())
	if err := dir.Prepare(); err != nil {
		t.Fatal(err)
	}
	if err := state.WriteJSON(dir.ConfigPath(), state.Container{ID: "c1", Process: proc}); err != nil {
		t.Fatal(err)
	}
	return dir
}

func run(t *testing.T, dir state.Dir) context.CancelFunc {
	t.Helper()
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})
	go func() { _ = initproc.RunContext(ctx, dir); close(done) }()
	t.Cleanup(func() { cancel(); <-done })
	return cancel
}

func eventually(t *testing.T, what string, cond func() bool) {
	t.Helper()
	deadline := time.Now().Add(10 * time.Second)
	for time.Now().Before(deadline) {
		if cond() {
			return
		}
		time.Sleep(50 * time.Millisecond)
	}
	t.Fatalf("timed out waiting for %s", what)
}

func exited(dir state.Dir, generation int) func() bool {
	return func() bool {
		e, err := dir.Exit()
		return err == nil && e.Generation == generation
	}
}

func TestRecordsOutputAndExitCode(t *testing.T) {
	dir := prepare(t, state.Process{Args: []string{"sh", "-c", "echo out; echo err >&2; exit 3"}})
	run(t, dir)
	eventually(t, "exit", exited(dir, 1))

	e, _ := dir.Exit()
	if e.Code != 3 {
		t.Fatalf("exit code %d, want 3", e.Code)
	}
	frames, err := state.ReadAllFrames(dir.LogPath())
	if err != nil {
		t.Fatal(err)
	}
	got := map[byte]string{}
	for _, f := range frames {
		got[f.Stream] += string(f.Payload)
	}
	if got[state.Stdout] != "out\n" || got[state.Stderr] != "err\n" {
		t.Fatalf("unexpected output %q", got)
	}
}

func TestStaysExitedAfterRestartAndRunsAgainOnStart(t *testing.T) {
	dir := prepare(t, state.Process{Args: []string{"sh", "-c", "echo run"}})
	cancel := run(t, dir)
	eventually(t, "first exit", exited(dir, 1))
	cancel()

	run(t, dir)
	time.Sleep(500 * time.Millisecond)
	if s := dir.Status(); s.Generation() != 1 {
		t.Fatalf("wrapper restarted the process, generation %d", s.Generation())
	}

	if _, err := state.Enqueue(dir.ControlDir(), ".json", func(p string) error {
		return state.WriteJSON(p, state.Control{Action: "start"})
	}); err != nil {
		t.Fatal(err)
	}
	eventually(t, "second exit", exited(dir, 2))
}

func TestSignalStopsProcess(t *testing.T) {
	dir := prepare(t, state.Process{Args: []string{"sleep", "60"}})
	run(t, dir)
	eventually(t, "start", func() bool { return dir.Status().Running() })
	_, _ = state.Enqueue(dir.ControlDir(), ".json", func(p string) error {
		return state.WriteJSON(p, state.Control{Action: "signal", Signal: "SIGTERM"})
	})
	eventually(t, "exit", exited(dir, 1))
	if e, _ := dir.Exit(); e.Code != 143 {
		t.Fatalf("exit code %d, want 143", e.Code)
	}
}

func TestExecTask(t *testing.T) {
	dir := prepare(t, state.Process{Args: []string{"sleep", "60"}, Env: []string{"FROM_CONTAINER=yes"}})
	run(t, dir)
	task := state.Task(filepath.Join(dir.TaskDir(), "t1"))
	if err := os.MkdirAll(string(task), 0o777); err != nil {
		t.Fatal(err)
	}
	_ = state.WriteJSON(task.RequestPath(), state.TaskRequest{Type: state.TaskExec, Process: &state.Process{
		Args: []string{"sh", "-c", "echo $FROM_CONTAINER $EXTRA; exit 7"},
		Env:  []string{"EXTRA=x"},
	}})
	var result state.TaskResult
	eventually(t, "result", func() bool { return state.ReadJSON(task.ResultPath(), &result) == nil })
	if result.Code != 7 {
		t.Fatalf("exit code %d, want 7", result.Code)
	}
	frames, _ := state.ReadAllFrames(task.OutputPath())
	if len(frames) != 1 || string(frames[0].Payload) != "yes x\n" {
		t.Fatalf("unexpected output %+v", frames)
	}
}

func TestArchiveIsExtractedBeforeStart(t *testing.T) {
	target := t.TempDir()
	dir := prepare(t, state.Process{Args: []string{"cat", filepath.Join(target, "etc/greeting")}})

	var buf bytes.Buffer
	tw := tar.NewWriter(&buf)
	_ = tw.WriteHeader(&tar.Header{Name: "etc/greeting", Mode: 0o644, Size: 6, Typeflag: tar.TypeReg})
	_, _ = tw.Write([]byte("hello\n"))
	_ = tw.Close()
	_ = os.WriteFile(filepath.Join(dir.ArchiveDir(), "1.tar"), buf.Bytes(), 0o666)
	_ = state.WriteJSON(filepath.Join(dir.ArchiveDir(), "1.json"), state.ArchiveRequest{Path: target, Tar: "1.tar"})

	run(t, dir)
	eventually(t, "exit", exited(dir, 1))
	frames, _ := state.ReadAllFrames(dir.LogPath())
	var out strings.Builder
	for _, f := range frames {
		out.Write(f.Payload)
	}
	if out.String() != "hello\n" {
		t.Fatalf("output %q", out.String())
	}
	if _, err := os.Stat(filepath.Join(dir.ArchiveDir(), "1.done")); err != nil {
		t.Fatalf("no done marker: %v", err)
	}
}

func TestStatAndArchiveGet(t *testing.T) {
	src := t.TempDir()
	_ = os.WriteFile(filepath.Join(src, "file.txt"), []byte("content"), 0o600)
	dir := prepare(t, state.Process{Args: []string{"sleep", "60"}})
	run(t, dir)

	task := state.Task(filepath.Join(dir.TaskDir(), "t2"))
	_ = os.MkdirAll(string(task), 0o777)
	_ = state.WriteJSON(task.RequestPath(), state.TaskRequest{Type: state.TaskArchiveGet, Path: src})
	var result state.TaskResult
	eventually(t, "result", func() bool { return state.ReadJSON(task.ResultPath(), &result) == nil })
	if result.Stat == nil || !result.Stat.Mode.IsDir() {
		t.Fatalf("unexpected stat %+v", result)
	}
	f, err := os.Open(task.ArchivePath())
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = f.Close() }()
	tr := tar.NewReader(f)
	var names []string
	for {
		h, err := tr.Next()
		if err != nil {
			break
		}
		names = append(names, h.Name)
	}
	want := filepath.Base(src) + "/file.txt"
	if len(names) != 2 || names[1] != want {
		t.Fatalf("entries %v, want %s", names, want)
	}

	missing := state.Task(filepath.Join(dir.TaskDir(), "t3"))
	_ = os.MkdirAll(string(missing), 0o777)
	_ = state.WriteJSON(missing.RequestPath(), state.TaskRequest{Type: state.TaskStat, Path: "/does/not/exist"})
	result = state.TaskResult{}
	eventually(t, "result", func() bool { return state.ReadJSON(missing.ResultPath(), &result) == nil })
	if !result.NotFound {
		t.Fatalf("expected not found, got %+v", result)
	}
}
