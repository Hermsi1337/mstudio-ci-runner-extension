package handlers

import (
	"encoding/json"
	"net/http"
	"runtime"
	"time"
)

type SystemHandler struct {
	projectID string
	stackID   string
}

func NewSystemHandler(projectID, stackID string) *SystemHandler {
	return &SystemHandler{
		projectID: projectID,
		stackID:   stackID,
	}
}

func (h *SystemHandler) Ping(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("API-Version", "1.44")
	w.Header().Set("Docker-Experimental", "false")
	w.Header().Set("Cache-Control", "no-cache, no-store, must-revalidate")
	w.Header().Set("Pragma", "no-cache")
	w.WriteHeader(http.StatusOK)
	if r.Method != http.MethodHead {
		_, _ = w.Write([]byte("OK"))
	}
}

type VersionResponse struct {
	Platform struct {
		Name string `json:"Name"`
	} `json:"Platform"`
	Components    []Component `json:"Components"`
	Version       string      `json:"Version"`
	APIVersion    string      `json:"ApiVersion"`
	MinAPIVersion string      `json:"MinAPIVersion"`
	GitCommit     string      `json:"GitCommit"`
	GoVersion     string      `json:"GoVersion"`
	Os            string      `json:"Os"`
	Arch          string      `json:"Arch"`
	KernelVersion string      `json:"KernelVersion,omitempty"`
	BuildTime     string      `json:"BuildTime"`
}

type Component struct {
	Name    string            `json:"Name"`
	Version string            `json:"Version"`
	Details map[string]string `json:"Details,omitempty"`
}

func (h *SystemHandler) Version(w http.ResponseWriter, r *http.Request) {
	response := VersionResponse{
		Version:       "24.0.0",
		APIVersion:    "1.44",
		MinAPIVersion: "1.24",
		GitCommit:     "mittwald-adapter",
		GoVersion:     runtime.Version(),
		Os:            runtime.GOOS,
		Arch:          runtime.GOARCH,
		BuildTime:     time.Now().Format(time.RFC3339),
	}
	response.Platform.Name = "mittwald Container Platform"
	response.Components = []Component{
		{
			Name:    "Engine",
			Version: "24.0.0",
			Details: map[string]string{
				"ApiVersion":    "1.44",
				"MinAPIVersion": "1.24",
				"GitCommit":     "mittwald-adapter",
				"GoVersion":     runtime.Version(),
				"Os":            runtime.GOOS,
				"Arch":          runtime.GOARCH,
			},
		},
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(response)
}

type InfoResponse struct {
	ID                 string                 `json:"ID"`
	Containers         int                    `json:"Containers"`
	ContainersRunning  int                    `json:"ContainersRunning"`
	ContainersPaused   int                    `json:"ContainersPaused"`
	ContainersStopped  int                    `json:"ContainersStopped"`
	Images             int                    `json:"Images"`
	Driver             string                 `json:"Driver"`
	DriverStatus       [][]string             `json:"DriverStatus"`
	Plugins            Plugins                `json:"Plugins"`
	MemoryLimit        bool                   `json:"MemoryLimit"`
	SwapLimit          bool                   `json:"SwapLimit"`
	KernelMemory       bool                   `json:"KernelMemory"`
	KernelMemoryTCP    bool                   `json:"KernelMemoryTCP"`
	CPUCfsPeriod       bool                   `json:"CpuCfsPeriod"`
	CPUCfsQuota        bool                   `json:"CpuCfsQuota"`
	CPUShares          bool                   `json:"CPUShares"`
	CPUSet             bool                   `json:"CPUSet"`
	PidsLimit          bool                   `json:"PidsLimit"`
	IPv4Forwarding     bool                   `json:"IPv4Forwarding"`
	BridgeNfIptables   bool                   `json:"BridgeNfIptables"`
	BridgeNfIP6tables  bool                   `json:"BridgeNfIp6tables"`
	Debug              bool                   `json:"Debug"`
	NFd                int                    `json:"NFd"`
	OomKillDisable     bool                   `json:"OomKillDisable"`
	NGoroutines        int                    `json:"NGoroutines"`
	SystemTime         string                 `json:"SystemTime"`
	LoggingDriver      string                 `json:"LoggingDriver"`
	CgroupDriver       string                 `json:"CgroupDriver"`
	CgroupVersion      string                 `json:"CgroupVersion"`
	NEventsListener    int                    `json:"NEventsListener"`
	KernelVersion      string                 `json:"KernelVersion"`
	OperatingSystem    string                 `json:"OperatingSystem"`
	OSVersion          string                 `json:"OSVersion"`
	OSType             string                 `json:"OSType"`
	Architecture       string                 `json:"Architecture"`
	IndexServerAddress string                 `json:"IndexServerAddress"`
	NCPU               int                    `json:"NCPU"`
	MemTotal           int64                  `json:"MemTotal"`
	DockerRootDir      string                 `json:"DockerRootDir"`
	HTTPProxy          string                 `json:"HttpProxy"`
	HTTPSProxy         string                 `json:"HttpsProxy"`
	NoProxy            string                 `json:"NoProxy"`
	Name               string                 `json:"Name"`
	Labels             []string               `json:"Labels"`
	ExperimentalBuild  bool                   `json:"ExperimentalBuild"`
	ServerVersion      string                 `json:"ServerVersion"`
	Runtimes           map[string]RuntimeInfo `json:"Runtimes"`
	DefaultRuntime     string                 `json:"DefaultRuntime"`
	Swarm              SwarmInfo              `json:"Swarm"`
	LiveRestoreEnabled bool                   `json:"LiveRestoreEnabled"`
	Isolation          string                 `json:"Isolation"`
	InitBinary         string                 `json:"InitBinary"`
	SecurityOptions    []string               `json:"SecurityOptions"`
	Warnings           []string               `json:"Warnings"`
}

type Plugins struct {
	Volume  []string `json:"Volume"`
	Network []string `json:"Network"`
	Log     []string `json:"Log"`
}

type RuntimeInfo struct {
	Path string `json:"path"`
}

type SwarmInfo struct {
	LocalNodeState string `json:"LocalNodeState"`
}

func (h *SystemHandler) Info(w http.ResponseWriter, r *http.Request) {
	response := InfoResponse{
		ID:                h.projectID,
		Containers:        0,
		ContainersRunning: 0,
		ContainersPaused:  0,
		ContainersStopped: 0,
		Images:            0,
		Driver:            "overlay2",
		DriverStatus:      [][]string{},
		Plugins: Plugins{
			Volume:  []string{"local"},
			Network: []string{"bridge", "host", "null"},
			Log:     []string{"json-file"},
		},
		MemoryLimit:        true,
		SwapLimit:          true,
		KernelMemory:       true,
		KernelMemoryTCP:    true,
		CPUCfsPeriod:       true,
		CPUCfsQuota:        true,
		CPUShares:          true,
		CPUSet:             true,
		PidsLimit:          true,
		IPv4Forwarding:     true,
		BridgeNfIptables:   true,
		BridgeNfIP6tables:  true,
		Debug:              false,
		NFd:                100,
		OomKillDisable:     true,
		NGoroutines:        runtime.NumGoroutine(),
		SystemTime:         time.Now().Format(time.RFC3339Nano),
		LoggingDriver:      "json-file",
		CgroupDriver:       "cgroupfs",
		CgroupVersion:      "2",
		NEventsListener:    0,
		KernelVersion:      "5.15.0",
		OperatingSystem:    "mittwald Container Platform",
		OSVersion:          "1.0",
		OSType:             "linux",
		Architecture:       runtime.GOARCH,
		IndexServerAddress: "https://index.docker.io/v1/",
		NCPU:               runtime.NumCPU(),
		MemTotal:           8589934592,
		DockerRootDir:      "/var/lib/docker",
		Name:               "mittwald-" + h.stackID,
		Labels: []string{
			"mittwald.project.id=" + h.projectID,
			"mittwald.stack.id=" + h.stackID,
		},
		ExperimentalBuild: false,
		ServerVersion:     "24.0.0",
		Runtimes: map[string]RuntimeInfo{
			"runc": {Path: "runc"},
		},
		DefaultRuntime:     "runc",
		Swarm:              SwarmInfo{LocalNodeState: "inactive"},
		LiveRestoreEnabled: false,
		Isolation:          "default",
		InitBinary:         "docker-init",
		SecurityOptions:    []string{"name=seccomp,profile=default"},
		Warnings:           []string{},
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(response)
}
