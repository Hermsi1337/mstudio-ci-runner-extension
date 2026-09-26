package engine

import (
	"context"
	"errors"
	"io"
	"os"
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

// Attach streams the output of the next run, or of the current one if the
// container runs, until that run ends. `docker run` attaches before it starts
// the container, so the stream starts with the first line.
func (e *Engine) Attach(ctx context.Context, ref string, logs bool, out Output) error {
	c, err := e.Resolve(ref)
	if err != nil {
		return err
	}
	dir := e.dir(c.ID)
	st := dir.Status()
	target := st.Generation()
	if !st.Running() {
		target++
	}
	r, err := waitFrames(ctx, dir, true)
	if err != nil || r == nil {
		return err
	}
	defer func() { _ = r.Close() }()
	if st.Running() && !logs {
		r.SeekEnd()
	}
	return e.follow(ctx, dir, r, out, func(*state.Frame) bool { return true }, false, func() bool {
		ex, err := dir.Exit()
		return err == nil && ex.Generation >= target
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
