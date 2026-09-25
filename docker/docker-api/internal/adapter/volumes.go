package adapter

import (
	"context"
	"errors"
	"strings"
	"sync"

	"github.com/hermsi1337/mstudio-ci-runner-extension/docker/docker-api/internal/mittwald"
	"github.com/mittwald/api-client-go/mittwaldv2/generated/clients/containerclientv2"
	"github.com/mittwald/api-client-go/mittwaldv2/generated/schemas/containerv2"
	"github.com/moby/moby/api/types/volume"
)

var (
	ErrVolumeNotFound      = errors.New("volume not found")
	ErrVolumeAlreadyExists = errors.New("volume already exists")
)

type VolumeAdapter struct {
	client    mittwald.ContainerClient
	projectID string
	stackID   string
	mu        sync.RWMutex
	nameToID  map[string]string
}

func NewVolumeAdapter(client mittwald.ContainerClient, projectID, stackID string) *VolumeAdapter {
	return &VolumeAdapter{
		client:    client,
		projectID: projectID,
		stackID:   stackID,
		nameToID:  make(map[string]string),
	}
}

func (a *VolumeAdapter) List(ctx context.Context) (*volume.ListResponse, error) {
	volumes, _, err := a.client.ListStackVolumes(ctx, containerclientv2.ListStackVolumesRequest{
		StackID: a.stackID,
	})
	if err != nil {
		return nil, err
	}

	response := &volume.ListResponse{
		Volumes:  make([]volume.Volume, 0),
		Warnings: []string{},
	}

	if volumes == nil {
		return response, nil
	}

	a.mu.Lock()
	a.nameToID = make(map[string]string)
	for _, vol := range *volumes {
		a.nameToID[vol.Name] = vol.Id
		response.Volumes = append(response.Volumes, mittwald.VolumeResponseToDocker(vol))
	}
	a.mu.Unlock()

	return response, nil
}

func (a *VolumeAdapter) Inspect(ctx context.Context, name string) (*volume.Volume, error) {
	volumeID, err := a.resolveVolumeID(ctx, name)
	if err != nil {
		return nil, err
	}

	vol, _, err := a.client.GetVolume(ctx, containerclientv2.GetVolumeRequest{
		VolumeID: volumeID,
	})
	if err != nil {
		return nil, err
	}

	result := mittwald.VolumeResponseToDocker(*vol)
	return &result, nil
}

func (a *VolumeAdapter) Create(ctx context.Context, req volume.CreateRequest) (*volume.Volume, error) {
	a.mu.RLock()
	_, exists := a.nameToID[req.Name]
	a.mu.RUnlock()

	if exists {
		return nil, ErrVolumeAlreadyExists
	}

	volumeName := sanitizeVolumeName(req.Name)

	volumeReq := containerv2.VolumeRequest{}

	updateReq := containerclientv2.UpdateStackRequest{
		StackID: a.stackID,
		Body: containerclientv2.UpdateStackRequestBody{
			Volumes: map[string]containerv2.VolumeRequest{
				volumeName: volumeReq,
			},
		},
	}

	_, _, err := a.client.UpdateStack(ctx, updateReq)
	if err != nil {
		return nil, err
	}

	volumes, _, err := a.client.ListStackVolumes(ctx, containerclientv2.ListStackVolumesRequest{
		StackID: a.stackID,
	})
	if err != nil {
		return nil, err
	}

	if volumes != nil {
		for _, vol := range *volumes {
			if vol.Name == volumeName {
				a.mu.Lock()
				a.nameToID[vol.Name] = vol.Id
				a.mu.Unlock()
				result := mittwald.VolumeResponseToDocker(vol)
				return &result, nil
			}
		}
	}

	return &volume.Volume{
		Name:       volumeName,
		Driver:     "local",
		Mountpoint: "/var/lib/docker/volumes/" + volumeName + "/_data",
		Labels:     req.Labels,
		Scope:      "local",
		Options:    make(map[string]string),
	}, nil
}

func (a *VolumeAdapter) Remove(ctx context.Context, name string) error {
	volumeID, err := a.resolveVolumeID(ctx, name)
	if err != nil {
		return err
	}

	_, err = a.client.DeleteVolume(ctx, containerclientv2.DeleteVolumeRequest{
		VolumeID: volumeID,
	})
	if err != nil {
		return err
	}

	a.mu.Lock()
	delete(a.nameToID, name)
	a.mu.Unlock()

	return nil
}

func (a *VolumeAdapter) resolveVolumeID(ctx context.Context, name string) (string, error) {
	a.mu.RLock()
	id, ok := a.nameToID[name]
	a.mu.RUnlock()

	if ok {
		return id, nil
	}

	volumes, _, err := a.client.ListStackVolumes(ctx, containerclientv2.ListStackVolumesRequest{
		StackID: a.stackID,
	})
	if err != nil {
		return "", err
	}

	if volumes != nil {
		a.mu.Lock()
		for _, vol := range *volumes {
			a.nameToID[vol.Name] = vol.Id
			if vol.Name == name {
				id = vol.Id
			}
		}
		a.mu.Unlock()
	}

	if id != "" {
		return id, nil
	}

	return "", ErrVolumeNotFound
}

func sanitizeVolumeName(name string) string {
	name = strings.Map(func(r rune) rune {
		if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || r == '_' || r == '-' || r == '.' {
			return r
		}
		return '_'
	}, name)

	if len(name) > 255 {
		name = name[:255]
	}

	if len(name) == 0 {
		name = "volume"
	}

	return name
}
