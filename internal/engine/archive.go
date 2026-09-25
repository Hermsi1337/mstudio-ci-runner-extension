package engine

import (
	"context"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/mittwald/mittwald-container-adapter/internal/state"
)

// PutArchive hands a tar stream to the wrapper. Before the first start the
// wrapper extracts it before it starts the process; afterwards the call waits
// until the files are in place, so a following exec sees them.
func (e *Engine) PutArchive(ctx context.Context, ref, path string, body io.Reader) error {
	c, err := e.Resolve(ref)
	if err != nil {
		return err
	}
	if c.Virtual != "" {
		_, _ = io.Copy(io.Discard, body)
		return nil
	}
	if !strings.HasPrefix(path, "/") {
		path = "/" + path
	}
	dir := e.dir(c.ID)
	name := fmt.Sprintf("%d", time.Now().UnixNano())
	tarPath := filepath.Join(dir.ArchiveDir(), name+".tar")
	tmp := filepath.Join(dir.ArchiveDir(), "."+name+".tar")
	f, err := os.OpenFile(tmp, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o666)
	if err != nil {
		return err
	}
	if _, err := io.Copy(f, body); err != nil {
		_ = f.Close()
		_ = os.Remove(tmp)
		return err
	}
	if err := f.Close(); err != nil {
		return err
	}
	if err := os.Rename(tmp, tarPath); err != nil {
		return err
	}
	request := filepath.Join(dir.ArchiveDir(), name+".json")
	if err := state.WriteJSON(request, state.ArchiveRequest{Path: path, Tar: name + ".tar"}); err != nil {
		return err
	}
	if !dir.Alive() {
		return nil
	}
	base := strings.TrimSuffix(request, ".json")
	deadline := time.Now().Add(2 * time.Minute)
	for time.Now().Before(deadline) {
		if _, err := os.Stat(base + ".done"); err == nil {
			_ = os.Remove(base + ".done")
			return nil
		}
		if msg, err := os.ReadFile(base + ".error"); err == nil {
			_ = os.Remove(base + ".error")
			if strings.Contains(string(msg), "no such file") || strings.Contains(string(msg), "not a directory") {
				return fmt.Errorf("%w: %s", ErrNotFound, msg)
			}
			return fmt.Errorf("extracting archive failed: %s", msg)
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(50 * time.Millisecond):
		}
	}
	return fmt.Errorf("the container did not extract the archive within 2 minutes")
}

func (e *Engine) pathTask(ctx context.Context, ref, path, kind string) (*state.TaskResult, state.Task, error) {
	c, err := e.Resolve(ref)
	if err != nil {
		return nil, "", err
	}
	if !e.dir(c.ID).Alive() {
		return nil, "", fmt.Errorf("%w: reading files needs a started container on mittwald Container Hosting", ErrConflict)
	}
	task, err := e.submitTask(c, newID(), state.TaskRequest{Type: kind, Path: path})
	if err != nil {
		return nil, "", err
	}
	result, err := e.awaitTask(ctx, task, nil)
	if err != nil {
		_ = os.RemoveAll(string(task))
		return nil, "", err
	}
	if result.NotFound {
		_ = os.RemoveAll(string(task))
		return nil, "", fmt.Errorf("%w: could not find the file %s in container %s", ErrNotFound, path, c.Name)
	}
	if result.Error != "" {
		_ = os.RemoveAll(string(task))
		return nil, "", fmt.Errorf("%s", result.Error)
	}
	return result, task, nil
}

func (e *Engine) StatPath(ctx context.Context, ref, path string) (*state.PathStat, error) {
	result, task, err := e.pathTask(ctx, ref, path, state.TaskStat)
	if err != nil {
		return nil, err
	}
	_ = os.RemoveAll(string(task))
	return result.Stat, nil
}

// GetArchive returns the stat of path and a reader for its tar archive. The
// caller closes the reader, which removes the task.
func (e *Engine) GetArchive(ctx context.Context, ref, path string) (*state.PathStat, io.ReadCloser, error) {
	result, task, err := e.pathTask(ctx, ref, path, state.TaskArchiveGet)
	if err != nil {
		return nil, nil, err
	}
	f, err := os.Open(task.ArchivePath())
	if err != nil {
		_ = os.RemoveAll(string(task))
		return nil, nil, err
	}
	return result.Stat, &taskFile{File: f, task: task}, nil
}

type taskFile struct {
	*os.File
	task state.Task
}

func (t *taskFile) Close() error {
	err := t.File.Close()
	_ = os.RemoveAll(string(t.task))
	return err
}
