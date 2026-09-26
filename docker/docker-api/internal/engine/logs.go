package engine

import (
	"context"
	"errors"
	"io"
	"os"
	"sync"
	"time"

	"github.com/hermsi1337/mstudio-ci-runner-extension/docker/docker-api/internal/state"
)

type LogOptions struct {
	Follow     bool
	Stdout     bool
	Stderr     bool
	Since      time.Time
	Until      time.Time
	Timestamps bool
	Tail       int
}

// Output writes frames to a client, multiplexed unless the container has a
// TTY, which is what the Docker API does.
type Output struct {
	W     io.Writer
	Flush func()
	Raw   bool
}

func (o Output) frame(f *state.Frame, timestamps bool) error {
	payload := f.Payload
	if timestamps {
		payload = append([]byte(f.Time.UTC().Format(time.RFC3339Nano)+" "), payload...)
	}
	var err error
	if o.Raw {
		_, err = o.W.Write(payload)
	} else {
		err = state.WriteDockerFrame(o.W, f.Stream, payload)
	}
	if err == nil && o.Flush != nil {
		o.Flush()
	}
	return err
}

func (e *Engine) Tty(ref string) bool {
	c, err := e.Resolve(ref)
	return err == nil && c.Process.Tty
}

func (e *Engine) Logs(ctx context.Context, ref string, opts LogOptions, out Output) error {
	c, err := e.Resolve(ref)
	if err != nil {
		return err
	}
	dir := e.dir(c.ID)
	keep := func(f *state.Frame) bool {
		if f.Stream == state.Stdout && !opts.Stdout || f.Stream == state.Stderr && !opts.Stderr {
			return false
		}
		if !opts.Since.IsZero() && f.Time.Before(opts.Since) {
			return false
		}
		return opts.Until.IsZero() || f.Time.Before(opts.Until)
	}

	r, err := waitFrames(ctx, dir, opts.Follow)
	if err != nil || r == nil {
		return err
	}
	defer func() { _ = r.Close() }()

	var backlog []*state.Frame
	for {
		f, err := r.Next()
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			return err
		}
		if keep(f) {
			backlog = append(backlog, f)
		}
	}
	if opts.Tail >= 0 && len(backlog) > opts.Tail {
		backlog = backlog[len(backlog)-opts.Tail:]
	}
	for _, f := range backlog {
		if err := out.frame(f, opts.Timestamps); err != nil {
			return err
		}
	}
	if !opts.Follow {
		return nil
	}
	return e.follow(ctx, dir, r, out, keep, opts.Timestamps, func() bool {
		return !dir.Status().Running() || (!opts.Until.IsZero() && time.Now().After(opts.Until))
	})
}

// attachDrainTimeout bounds how long the end of a run waits for its attach
// streams, as dockerd does.
const attachDrainTimeout = 2 * time.Second

// Attachment is the run an attach streams: the next run, or the current one
// if the container runs.
type Attachment struct {
	e         *Engine
	container string
	dir       state.Dir
	target    int
	offset    int64
	done      chan struct{}
	closed    sync.Once
}

// attachments holds the open attach streams. Like dockerd, the adapter
// reports the end of a run only once its streams delivered the last output:
// docker compose stops reading when it sees the die event.
type attachments struct {
	mu   sync.Mutex
	open map[*Attachment]struct{}
}

func (as *attachments) add(a *Attachment) {
	as.mu.Lock()
	defer as.mu.Unlock()
	if as.open == nil {
		as.open = map[*Attachment]struct{}{}
	}
	as.open[a] = struct{}{}
}

func (as *attachments) remove(a *Attachment) {
	as.mu.Lock()
	defer as.mu.Unlock()
	delete(as.open, a)
}

// drain waits until the streams of the given run of a container ended.
func (as *attachments) drain(container string, generation int, timeout time.Duration) {
	as.mu.Lock()
	var pending []chan struct{}
	for a := range as.open {
		if a.container == container && a.target <= generation {
			pending = append(pending, a.done)
		}
	}
	as.mu.Unlock()
	deadline := time.After(timeout)
	for _, done := range pending {
		select {
		case <-done:
		case <-deadline:
			return
		}
	}
}

// Attach fixes the run to stream. The handler calls it before it answers the
// client, because `docker run` and docker compose start the container right
// after the attach returns: a short run could end before the stream looks at
// the container and its output would be lost.
func (e *Engine) Attach(ref string, logs bool) (*Attachment, error) {
	c, err := e.Resolve(ref)
	if err != nil {
		return nil, err
	}
	dir := e.dir(c.ID)
	st := dir.Status()
	a := &Attachment{e: e, container: c.ID, dir: dir, target: st.Generation(), done: make(chan struct{})}
	if !st.Running() {
		a.target++
	} else if !logs {
		if info, err := os.Stat(dir.LogPath()); err == nil {
			a.offset = info.Size()
		}
	}
	e.attachments.add(a)
	return a, nil
}

// Close ends the attachment. Stream closes it on return; a caller that does
// not stream closes it itself.
func (a *Attachment) Close() {
	a.closed.Do(func() {
		a.e.attachments.remove(a)
		close(a.done)
	})
}

// Stream writes the output of the attached run until that run ends.
func (a *Attachment) Stream(ctx context.Context, out Output) error {
	defer a.Close()
	r, err := waitFrames(ctx, a.dir, true)
	if err != nil || r == nil {
		return err
	}
	defer func() { _ = r.Close() }()
	r.SetOffset(a.offset)
	return a.e.follow(ctx, a.dir, r, out, func(*state.Frame) bool { return true }, false, func() bool {
		ex, err := a.dir.Exit()
		return err == nil && ex.Generation >= a.target
	})
}

// waitFrames opens the log, waiting for the wrapper to create it.
func waitFrames(ctx context.Context, dir state.Dir, wait bool) (*state.FrameReader, error) {
	for {
		r, err := state.OpenFrames(dir.LogPath())
		if err == nil {
			return r, nil
		}
		if !os.IsNotExist(err) {
			return nil, err
		}
		if !wait {
			return nil, nil
		}
		if _, statErr := os.Stat(dir.ConfigPath()); statErr != nil {
			return nil, nil
		}
		select {
		case <-ctx.Done():
			return nil, nil
		case <-time.After(150 * time.Millisecond):
		}
	}
}

func (e *Engine) follow(ctx context.Context, dir state.Dir, r *state.FrameReader, out Output, keep func(*state.Frame) bool, timestamps bool, done func() bool) error {
	finished := false
	for {
		f, err := r.Next()
		if err == nil {
			if keep(f) {
				if err := out.frame(f, timestamps); err != nil {
					return err
				}
			}
			continue
		}
		if !errors.Is(err, io.EOF) {
			return err
		}
		if finished {
			return nil
		}
		if _, statErr := os.Stat(dir.ConfigPath()); statErr != nil || done() {
			// One more pass picks up lines written right before the exit.
			finished = true
			continue
		}
		select {
		case <-ctx.Done():
			return nil
		case <-time.After(100 * time.Millisecond):
		}
	}
}
