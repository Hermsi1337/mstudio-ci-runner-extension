// Package fakeplatform stands in for mittwald Container Hosting in tests. It
// implements the container API the engine uses and "runs" a service by
// starting mstudio-init as a local process on the service's state directory.
// The image is ignored: the command of the container runs on the test host.
package fakeplatform

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/mittwald/api-client-go/mittwaldv2/generated/clients/containerclientv2"
	"github.com/mittwald/api-client-go/mittwaldv2/generated/schemas/containerv2"

	"github.com/hermsi1337/mstudio-ci-runner-extension/docker/docker-api/internal/state"
)

type Platform struct {
	// InitCommand starts mstudio-init; the self directory is passed in
	// MSTUDIO_INIT_SELF.
	InitCommand []string
	// Images answers image lookups; unknown images get an empty config.
	Images map[string]containerv2.ContainerImageConfig
	// Missing images make the lookup return 404.
	Missing map[string]bool

	mu       sync.Mutex
	services map[string]*service
	counter  int
	Requests []string
}

type service struct {
	resp containerv2.ServiceResponse
	req  containerv2.ServiceRequest
	proc *exec.Cmd
}

func New(initCommand ...string) *Platform {
	return &Platform{
		InitCommand: initCommand,
		Images:      map[string]containerv2.ContainerImageConfig{},
		Missing:     map[string]bool{},
		services:    map[string]*service{},
	}
}

func ok(code int) *http.Response { return &http.Response{StatusCode: code} }

func (p *Platform) record(format string, args ...any) {
	p.Requests = append(p.Requests, fmt.Sprintf(format, args...))
}

// Close stops every running wrapper.
func (p *Platform) Close() {
	p.mu.Lock()
	defer p.mu.Unlock()
	for _, s := range p.services {
		p.stop(s)
	}
}

func (p *Platform) stop(s *service) {
	if s.proc != nil && s.proc.Process != nil {
		_ = s.proc.Process.Signal(syscall.SIGTERM)
		done := make(chan struct{})
		go func() { _ = s.proc.Wait(); close(done) }()
		select {
		case <-done:
		case <-time.After(15 * time.Second):
			_ = s.proc.Process.Kill()
		}
		s.proc = nil
	}
	s.resp.Status = containerv2.ServiceStatusStopped
}

func (p *Platform) start(s *service) error {
	self := ""
	for _, v := range s.req.Volumes {
		source, target, _ := strings.Cut(v, ":")
		if target == state.SelfDir {
			self = source
		}
	}
	if self == "" {
		s.resp.Status = containerv2.ServiceStatusRunning
		return nil
	}
	cmd := exec.Command(p.InitCommand[0], p.InitCommand[1:]...)
	cmd.Env = append(os.Environ(), "MSTUDIO_INIT_SELF="+self)
	cmd.Stdout = os.Stderr
	cmd.Stderr = os.Stderr
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
	if err := cmd.Start(); err != nil {
		return err
	}
	s.proc = cmd
	s.resp.Status = containerv2.ServiceStatusRunning
	msg := "the container is ready"
	s.resp.Message = &msg
	return nil
}

func (p *Platform) ListServices(_ context.Context, req containerclientv2.ListServicesRequest, _ ...func(*http.Request) error) (*[]containerv2.ServiceResponse, *http.Response, error) {
	p.mu.Lock()
	defer p.mu.Unlock()
	list := []containerv2.ServiceResponse{}
	for _, s := range p.services {
		list = append(list, s.resp)
	}
	return &list, ok(200), nil
}

func (p *Platform) find(id string) *service {
	for _, s := range p.services {
		if s.resp.Id == id {
			return s
		}
	}
	return nil
}

func (p *Platform) GetService(_ context.Context, req containerclientv2.GetServiceRequest, _ ...func(*http.Request) error) (*containerv2.ServiceResponse, *http.Response, error) {
	p.mu.Lock()
	defer p.mu.Unlock()
	if s := p.find(req.ServiceID); s != nil {
		resp := s.resp
		return &resp, ok(200), nil
	}
	return nil, ok(404), fmt.Errorf("service %s not found", req.ServiceID)
}

func (p *Platform) StartService(_ context.Context, req containerclientv2.StartServiceRequest, _ ...func(*http.Request) error) (*http.Response, error) {
	p.mu.Lock()
	defer p.mu.Unlock()
	if s := p.find(req.ServiceID); s != nil && s.proc == nil {
		return ok(204), p.start(s)
	}
	return ok(204), nil
}

func (p *Platform) StopService(_ context.Context, req containerclientv2.StopServiceRequest, _ ...func(*http.Request) error) (*http.Response, error) {
	p.mu.Lock()
	defer p.mu.Unlock()
	if s := p.find(req.ServiceID); s != nil {
		p.stop(s)
	}
	return ok(204), nil
}

func (p *Platform) RestartService(_ context.Context, req containerclientv2.RestartServiceRequest, _ ...func(*http.Request) error) (*http.Response, error) {
	p.mu.Lock()
	defer p.mu.Unlock()
	if s := p.find(req.ServiceID); s != nil {
		p.stop(s)
		return ok(204), p.start(s)
	}
	return ok(404), nil
}

func (p *Platform) UpdateStack(_ context.Context, req containerclientv2.UpdateStackRequest, _ ...func(*http.Request) error) (*containerv2.StackResponse, *http.Response, error) {
	p.mu.Lock()
	defer p.mu.Unlock()
	for name, spec := range req.Body.Services {
		if existing, found := p.services[name]; found {
			p.stop(existing)
			delete(p.services, name)
		}
		if spec.Image == nil {
			p.record("remove %s", name)
			continue
		}
		p.counter++
		s := &service{req: spec, resp: containerv2.ServiceResponse{
			Id:          fmt.Sprintf("svc-%d", p.counter),
			ServiceName: name,
			ShortId:     fmt.Sprintf("c-%d", p.counter),
			StackId:     req.StackID,
			StatusSetAt: time.Now(),
			DeployedState: containerv2.ServiceState{
				Image:      *spec.Image,
				Command:    spec.Command,
				Entrypoint: spec.Entrypoint,
				Volumes:    spec.Volumes,
			},
		}}
		if spec.Description != nil {
			s.resp.Description = *spec.Description
		}
		p.record("declare %s", name)
		if err := p.start(s); err != nil {
			return nil, ok(500), err
		}
		p.services[name] = s
	}
	return &containerv2.StackResponse{Id: req.StackID}, ok(200), nil
}

func (p *Platform) DeclareStack(_ context.Context, req containerclientv2.DeclareStackRequest, _ ...func(*http.Request) error) (*containerv2.StackResponse, *http.Response, error) {
	return nil, ok(500), fmt.Errorf("the engine must never declare the whole stack")
}

func (p *Platform) ListStackVolumes(context.Context, containerclientv2.ListStackVolumesRequest, ...func(*http.Request) error) (*[]containerv2.VolumeResponse, *http.Response, error) {
	return &[]containerv2.VolumeResponse{}, ok(200), nil
}

func (p *Platform) GetVolume(context.Context, containerclientv2.GetVolumeRequest, ...func(*http.Request) error) (*containerv2.VolumeResponse, *http.Response, error) {
	return nil, ok(404), fmt.Errorf("not found")
}

func (p *Platform) DeleteVolume(context.Context, containerclientv2.DeleteVolumeRequest, ...func(*http.Request) error) (*http.Response, error) {
	return ok(204), nil
}

func (p *Platform) GetServiceLogs(context.Context, containerclientv2.GetServiceLogsRequest, ...func(*http.Request) error) (*http.Response, error) {
	return ok(404), fmt.Errorf("not used")
}

func (p *Platform) GetContainerImageConfig(_ context.Context, req containerclientv2.GetContainerImageConfigRequest, _ ...func(*http.Request) error) (*containerv2.ContainerImageConfig, *http.Response, error) {
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.Missing[req.ImageReference] {
		return nil, ok(404), fmt.Errorf("image not found")
	}
	cfg := p.Images[req.ImageReference]
	sum := sha256.Sum256([]byte(req.ImageReference))
	cfg.Digest = "sha256:" + hex.EncodeToString(sum[:])
	return &cfg, ok(200), nil
}

// Service returns the declared request of a service, for assertions.
func (p *Platform) Service(name string) (containerv2.ServiceRequest, bool) {
	p.mu.Lock()
	defer p.mu.Unlock()
	s, found := p.services[name]
	if !found {
		return containerv2.ServiceRequest{}, false
	}
	return s.req, true
}

// AddForeignService adds a service the engine did not create.
func (p *Platform) AddForeignService(name string) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.counter++
	p.services[name] = &service{resp: containerv2.ServiceResponse{
		Id:          fmt.Sprintf("svc-%d", p.counter),
		ServiceName: name,
		Status:      containerv2.ServiceStatusRunning,
		StatusSetAt: time.Now(),
	}}
}
