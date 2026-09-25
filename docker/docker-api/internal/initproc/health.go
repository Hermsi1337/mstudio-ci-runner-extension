package initproc

import (
	"bytes"
	"context"
	"strings"
	"time"

	"github.com/mittwald/mittwald-container-adapter/internal/state"
)

const (
	defaultHealthInterval = 30 * time.Second
	defaultHealthTimeout  = 30 * time.Second
	defaultHealthRetries  = 3
	healthLogSize         = 5
	healthOutputLimit     = 4096
)

// runHealth checks the container like dockerd does until ctx ends: starting
// until the first success, unhealthy after Retries failures outside the start
// period.
func (in *Init) runHealth(ctx context.Context, generation int) {
	cfg := in.container.Health
	if cfg == nil || len(cfg.Test) == 0 || cfg.Test[0] == "NONE" {
		return
	}
	var args []string
	switch cfg.Test[0] {
	case "CMD":
		args = cfg.Test[1:]
	case "CMD-SHELL":
		args = []string{"/bin/sh", "-c", strings.Join(cfg.Test[1:], " ")}
	default:
		args = cfg.Test
	}
	if len(args) == 0 {
		return
	}
	interval := or(cfg.Interval, defaultHealthInterval)
	timeout := or(cfg.Timeout, defaultHealthTimeout)
	startInterval := or(cfg.StartInterval, interval)
	retries := cfg.Retries
	if retries <= 0 {
		retries = defaultHealthRetries
	}
	started := time.Now()
	health := state.Health{Generation: generation, Status: "starting"}
	_ = state.WriteJSON(in.dir.HealthPath(), health)

	for {
		wait := interval
		if health.Status == "starting" {
			wait = startInterval
		}
		select {
		case <-ctx.Done():
			return
		case <-time.After(wait):
		}
		result := in.probe(args, timeout)
		health.Log = append(health.Log, result)
		if len(health.Log) > healthLogSize {
			health.Log = health.Log[len(health.Log)-healthLogSize:]
		}
		inStartPeriod := time.Since(started) < cfg.StartPeriod
		switch {
		case result.ExitCode == 0:
			health.Status = "healthy"
			health.FailingStreak = 0
		case inStartPeriod && health.Status == "starting":
		default:
			health.FailingStreak++
			if health.FailingStreak >= retries {
				health.Status = "unhealthy"
			}
		}
		_ = state.WriteJSON(in.dir.HealthPath(), health)
	}
}

func (in *Init) probe(args []string, timeout time.Duration) state.HealthResult {
	result := state.HealthResult{Start: time.Now()}
	var buf bytes.Buffer
	proc := state.Process{Args: args, WorkingDir: in.container.Process.WorkingDir, User: in.container.Process.User}
	p, err := in.spawn(proc, in.container.Process.Env, state.NewFrameWriter(&buf), false)
	if err != nil {
		result.End = time.Now()
		result.ExitCode = -1
		result.Output = err.Error()
		return result
	}
	select {
	case <-p.done:
		result.ExitCode = p.code
	case <-time.After(timeout):
		_ = killProcess(p.pid)
		<-p.done
		result.ExitCode = -1
		result.Output = "Health check exceeded timeout (" + timeout.String() + ")"
	}
	result.End = time.Now()
	if result.Output == "" {
		result.Output = framesText(buf.Bytes())
	}
	return result
}

// framesText drops the frame headers the frame writer adds.
func framesText(data []byte) string {
	var out strings.Builder
	for len(data) >= 13 {
		size := int(data[9])<<24 | int(data[10])<<16 | int(data[11])<<8 | int(data[12])
		if len(data) < 13+size {
			break
		}
		out.Write(data[13 : 13+size])
		data = data[13+size:]
	}
	text := out.String()
	if len(text) > healthOutputLimit {
		text = text[:healthOutputLimit]
	}
	return text
}

func or(d, fallback time.Duration) time.Duration {
	if d > 0 {
		return d
	}
	return fallback
}
