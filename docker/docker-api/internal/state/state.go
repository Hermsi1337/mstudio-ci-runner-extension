// Package state defines the directory that the adapter shares with every
// container it runs. mittwald Container Hosting has no API to attach to a
// process, read its exit code or run a command inside it, so the adapter wraps
// the process of every container with mstudio-init and both sides talk through
// files on the project file system.
//
// Layout below the root:
//
//	bin/mstudio-init                  the wrapper, copied there by the adapter
//	containers/<id>/config.json       the container as the adapter created it
//	containers/<id>/log               output of the process, see frame.go
//	containers/<id>/run.json          generation and start time of the current run
//	containers/<id>/exit.json         generation and exit code of the last run
//	containers/<id>/heartbeat         touched by the wrapper while it lives
//	containers/<id>/control/<n>.json  start and signal requests to the wrapper
//	containers/<id>/archives/<n>.tar  files to extract into the container
//	containers/<id>/tasks/<id>/       exec, stat and archive requests
//	networks/<id>.json                networks, only bookkeeping
//
// A container sees only bin/ and its own directory, mounted at MountPoint.
package state

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"
)

const (
	MountPoint  = "/.mstudio"
	SelfDir     = MountPoint + "/self"
	BinDir      = MountPoint + "/bin"
	InitBinary  = "mstudio-init"
	InitPath    = BinDir + "/" + InitBinary
	HeartbeatOK = 15 * time.Second
)

// Process is what the wrapper starts inside the container.
type Process struct {
	Args       []string `json:"args"`
	Env        []string `json:"env,omitempty"`
	WorkingDir string   `json:"workingDir,omitempty"`
	User       string   `json:"user,omitempty"`
	Tty        bool     `json:"tty,omitempty"`
	// Stdin feeds the process from the stdin files instead of /dev/null.
	Stdin bool `json:"stdin,omitempty"`
}

type Endpoint struct {
	NetworkID string   `json:"networkId"`
	Aliases   []string `json:"aliases,omitempty"`
}

// Container is the record the adapter writes when a container is created.
// Everything Docker clients ask about later is answered from it.
type Container struct {
	ID          string              `json:"id"`
	Name        string              `json:"name"`
	NameGiven   bool                `json:"nameGiven,omitempty"`
	ServiceName string              `json:"serviceName"`
	ServiceID   string              `json:"serviceId,omitempty"`
	Created     time.Time           `json:"created"`
	Image       string              `json:"image"`
	ImageDigest string              `json:"imageDigest,omitempty"`
	Entrypoint  []string            `json:"entrypoint,omitempty"`
	Cmd         []string            `json:"cmd,omitempty"`
	Process     Process             `json:"process"`
	ImageEnv    []string            `json:"imageEnv,omitempty"`
	Labels      map[string]string   `json:"labels,omitempty"`
	Ports       map[string]string   `json:"ports,omitempty"`
	Volumes     []string            `json:"volumes,omitempty"`
	Networks    map[string]Endpoint `json:"networks,omitempty"`
	NetworkMode string              `json:"networkMode,omitempty"`
	AutoRemove  bool                `json:"autoRemove,omitempty"`
	StopSignal  string              `json:"stopSignal,omitempty"`
	StopTimeout *int                `json:"stopTimeout,omitempty"`
	CPUs        string              `json:"cpus,omitempty"`
	Memory      string              `json:"memory,omitempty"`
	Virtual     string              `json:"virtual,omitempty"`
	Health      *HealthConfig       `json:"health,omitempty"`
}

// HealthConfig is the HEALTHCHECK of the container. The wrapper runs it,
// because the platform knows nothing about Docker health checks.
type HealthConfig struct {
	Test          []string      `json:"test"`
	Interval      time.Duration `json:"interval,omitempty"`
	Timeout       time.Duration `json:"timeout,omitempty"`
	StartPeriod   time.Duration `json:"startPeriod,omitempty"`
	StartInterval time.Duration `json:"startInterval,omitempty"`
	Retries       int           `json:"retries,omitempty"`
}

type HealthResult struct {
	Start    time.Time `json:"start"`
	End      time.Time `json:"end"`
	ExitCode int       `json:"exitCode"`
	Output   string    `json:"output"`
}

type Health struct {
	Generation    int            `json:"generation"`
	Status        string         `json:"status"`
	FailingStreak int            `json:"failingStreak"`
	Log           []HealthResult `json:"log"`
}

type Run struct {
	Generation int       `json:"generation"`
	StartedAt  time.Time `json:"startedAt"`
	Pid        int       `json:"pid"`
	IPs        []string  `json:"ips,omitempty"`
}

type Exit struct {
	Generation int       `json:"generation"`
	Code       int       `json:"code"`
	FinishedAt time.Time `json:"finishedAt"`
	Error      string    `json:"error,omitempty"`
	OOMKilled  bool      `json:"oomKilled,omitempty"`
}

type Control struct {
	Action string `json:"action"`
	Signal string `json:"signal,omitempty"`
}

type Network struct {
	ID      string            `json:"id"`
	Name    string            `json:"name"`
	Created time.Time         `json:"created"`
	Labels  map[string]string `json:"labels,omitempty"`
	Driver  string            `json:"driver"`
}

// Dir is one container directory, seen from the adapter or from the wrapper.
type Dir string

func (d Dir) path(parts ...string) string {
	return filepath.Join(append([]string{string(d)}, parts...)...)
}

func (d Dir) ConfigPath() string    { return d.path("config.json") }
func (d Dir) LogPath() string       { return d.path("log") }
func (d Dir) RunPath() string       { return d.path("run.json") }
func (d Dir) ExitPath() string      { return d.path("exit.json") }
func (d Dir) HeartbeatPath() string { return d.path("heartbeat") }
func (d Dir) HealthPath() string    { return d.path("health.json") }

// HostsPath holds the /etc/hosts entries of the other containers. The
// adapter writes it, the wrapper merges it into /etc/hosts, because the DNS
// of the stack knows only service names and caches a miss for a new one.
func (d Dir) HostsPath() string  { return d.path("hosts") }
func (d Dir) ControlDir() string { return d.path("control") }
func (d Dir) ArchiveDir() string { return d.path("archives") }
func (d Dir) TaskDir() string    { return d.path("tasks") }

// Prepare creates the directory tree. Every directory is world writable,
// because the wrapper runs as whatever user the image declares and the API
// cannot tell which uid that is.
func (d Dir) Prepare() error {
	for _, dir := range []string{string(d), d.ControlDir(), d.ArchiveDir(), d.TaskDir()} {
		if err := os.MkdirAll(dir, 0o777); err != nil {
			return err
		}
		if err := os.Chmod(dir, 0o1777); err != nil {
			return err
		}
	}
	return nil
}

func (d Dir) Container() (*Container, error) {
	var c Container
	return &c, ReadJSON(d.ConfigPath(), &c)
}

func (d Dir) Run() (*Run, error) {
	var r Run
	if err := ReadJSON(d.RunPath(), &r); err != nil {
		return nil, err
	}
	return &r, nil
}

func (d Dir) Health() (*Health, error) {
	var h Health
	if err := ReadJSON(d.HealthPath(), &h); err != nil {
		return nil, err
	}
	return &h, nil
}

func (d Dir) Exit() (*Exit, error) {
	var e Exit
	if err := ReadJSON(d.ExitPath(), &e); err != nil {
		return nil, err
	}
	return &e, nil
}

// Alive reports whether the wrapper touched its heartbeat recently.
func (d Dir) Alive() bool {
	info, err := os.Stat(d.HeartbeatPath())
	return err == nil && time.Since(info.ModTime()) < HeartbeatOK
}

// Status sums up run.json and exit.json. A container is running when its
// current run has no exit yet.
type Status struct {
	Run  *Run
	Exit *Exit
}

func (d Dir) Status() Status {
	run, _ := d.Run()
	exit, _ := d.Exit()
	return Status{Run: run, Exit: exit}
}

func (s Status) Started() bool { return s.Run != nil }

func (s Status) Running() bool {
	return s.Run != nil && (s.Exit == nil || s.Exit.Generation < s.Run.Generation)
}

func (s Status) Generation() int {
	if s.Run == nil {
		return 0
	}
	return s.Run.Generation
}

// Enqueue writes a numbered request into dir. The number orders requests and
// the rename makes a request visible only once it is complete.
func Enqueue(dir, ext string, write func(path string) error) (string, error) {
	name := strconv.FormatInt(time.Now().UnixNano(), 10)
	tmp := filepath.Join(dir, "."+name+ext)
	if err := write(tmp); err != nil {
		_ = os.Remove(tmp)
		return "", err
	}
	final := filepath.Join(dir, name+ext)
	return final, os.Rename(tmp, final)
}

// Pending lists the requests in dir with the given extension, oldest first.
func Pending(dir, ext string) []string {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil
	}
	var names []string
	for _, e := range entries {
		n := e.Name()
		if strings.HasPrefix(n, ".") || !strings.HasSuffix(n, ext) {
			continue
		}
		names = append(names, filepath.Join(dir, n))
	}
	sort.Strings(names)
	return names
}

func WriteJSON(path string, v any) error {
	data, err := json.Marshal(v)
	if err != nil {
		return err
	}
	tmp := fmt.Sprintf("%s.%d.tmp", path, time.Now().UnixNano())
	if err := os.WriteFile(tmp, data, 0o666); err != nil {
		return err
	}
	return os.Rename(tmp, path)
}

func ReadJSON(path string, v any) error {
	data, err := os.ReadFile(path)
	if err != nil {
		return err
	}
	return json.Unmarshal(data, v)
}

func IsNotExist(err error) bool {
	return errors.Is(err, os.ErrNotExist)
}
