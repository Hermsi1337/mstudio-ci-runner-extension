package engine

import (
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/moby/moby/api/types/container"

	"github.com/hermsi1337/mstudio-ci-runner-extension/docker/docker-api/internal/state"
)

type execInstance struct {
	ID          string
	ContainerID string
	Process     state.Process
	Running     bool
	ExitCode    *int
	Pid         int
	Detached    bool
}

type execStore struct {
	mu        sync.Mutex
	instances map[string]*execInstance
}

func newExecStore() *execStore {
	return &execStore{instances: map[string]*execInstance{}}
}

func (s *execStore) get(id string) (*execInstance, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	inst, ok := s.instances[id]
	if !ok {
		return nil, false
	}
	copied := *inst
	return &copied, true
}

func (s *execStore) update(id string, fn func(*execInstance)) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if inst, ok := s.instances[id]; ok {
		fn(inst)
	}
}

func (s *execStore) dropContainer(containerID string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	for id, inst := range s.instances {
		if inst.ContainerID == containerID {
			delete(s.instances, id)
		}
	}
}

func (e *Engine) CreateExec(ref string, req container.ExecCreateRequest) (string, error) {
	c, err := e.Resolve(ref)
	if err != nil {
		return "", err
	}
	if len(req.Cmd) == 0 {
		return "", fmt.Errorf("%w: no exec command specified", ErrInvalid)
	}
	if err := e.requireRunning(c); err != nil {
		return "", err
	}
	id := newID()
	e.execs.mu.Lock()
	e.execs.instances[id] = &execInstance{
		ID:          id,
		ContainerID: c.ID,
		Process: state.Process{
			Args:       req.Cmd,
			Env:        req.Env,
			WorkingDir: req.WorkingDir,
			User:       req.User,
			Tty:        req.Tty,
		},
	}
	e.execs.mu.Unlock()
	return id, nil
}

func (e *Engine) requireRunning(c *state.Container) error {
	dir := e.dir(c.ID)
	if c.Virtual != "" || !dir.Status().Running() || !dir.Alive() {
		return fmt.Errorf("%w: container %s is not running", ErrConflict, c.ID)
	}
	return nil
}

func (e *Engine) ExecTty(id string) bool {
	inst, ok := e.execs.get(id)
	return ok && inst.Process.Tty
}

// StartExec runs the exec instance through the wrapper and streams its
// output. With detach it returns once the wrapper claimed the request.
func (e *Engine) StartExec(ctx context.Context, id string, detach bool, out Output) error {
	inst, ok := e.execs.get(id)
	if !ok {
		return ErrExecNotFound
	}
	if inst.Running || inst.ExitCode != nil {
		return fmt.Errorf("%w: exec %s has already run", ErrConflict, id[:12])
	}
	c, err := e.Resolve(inst.ContainerID)
	if err != nil {
		return err
	}
	if err := e.requireRunning(c); err != nil {
		return err
	}
	e.execs.update(id, func(i *execInstance) { i.Running = true; i.Detached = detach })
	task, err := e.submitTask(c, id, state.TaskRequest{Type: state.TaskExec, Process: &inst.Process})
	if err != nil {
		e.execs.update(id, func(i *execInstance) { i.Running = false })
		return err
	}
	finish := func(result *state.TaskResult) {
		code := 126
		if result != nil {
			code = result.Code
		}
		e.execs.update(id, func(i *execInstance) {
			i.Running = false
			i.ExitCode = &code
			if result != nil {
				i.Pid = result.Pid
			}
		})
		_ = os.RemoveAll(string(task))
	}
	if detach {
		go func() {
			result, _ := e.awaitTask(context.Background(), task, nil)
			finish(result)
		}()
		return nil
	}
	result, err := e.awaitTask(ctx, task, &out)
	finish(result)
	return err
}

func (e *Engine) InspectExec(id string) (*container.ExecInspectResponse, error) {
	inst, ok := e.execs.get(id)
	if !ok {
		return nil, ErrExecNotFound
	}
	resp := &container.ExecInspectResponse{
		ID:          inst.ID,
		ContainerID: inst.ContainerID,
		Running:     inst.Running,
		Pid:         inst.Pid,
		ProcessConfig: &container.ExecProcessConfig{
			Tty:        inst.Process.Tty,
			Entrypoint: inst.Process.Args[0],
			Arguments:  inst.Process.Args[1:],
			User:       inst.Process.User,
		},
		OpenStdout: true,
		OpenStderr: true,
	}
	if inst.ExitCode != nil {
		resp.ExitCode = inst.ExitCode
	}
	return resp, nil
}

func (e *Engine) submitTask(c *state.Container, id string, req state.TaskRequest) (state.Task, error) {
	task := state.Task(filepath.Join(e.dir(c.ID).TaskDir(), id))
	if err := os.MkdirAll(string(task), 0o777); err != nil {
		return "", err
	}
	_ = os.Chmod(string(task), 0o1777)
	if err := state.WriteJSON(task.RequestPath(), req); err != nil {
		return "", err
	}
	return task, nil
}

// awaitTask waits for the result of a task and streams its output meanwhile.
func (e *Engine) awaitTask(ctx context.Context, task state.Task, out *Output) (*state.TaskResult, error) {
	var reader *state.FrameReader
	defer func() {
		if reader != nil {
			_ = reader.Close()
		}
	}()
	drain := func() error {
		if out == nil {
			return nil
		}
		if reader == nil {
			r, err := state.OpenFrames(task.OutputPath())
			if err != nil {
				return nil
			}
			reader = r
		}
		for {
			f, err := reader.Next()
			if errors.Is(err, io.EOF) {
				return nil
			}
			if err != nil {
				return err
			}
			if err := out.frame(f, false); err != nil {
				return err
			}
		}
	}
	claimDeadline := time.Now().Add(30 * time.Second)
	for {
		if err := drain(); err != nil {
			return nil, err
		}
		var result state.TaskResult
		if state.ReadJSON(task.ResultPath(), &result) == nil {
			if err := drain(); err != nil {
				return nil, err
			}
			return &result, nil
		}
		if time.Now().After(claimDeadline) {
			if _, err := os.Stat(task.RequestPath()); err == nil {
				return nil, fmt.Errorf("the container did not pick up the request, its init process does not respond")
			}
		}
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		case <-time.After(50 * time.Millisecond):
		}
	}
}
