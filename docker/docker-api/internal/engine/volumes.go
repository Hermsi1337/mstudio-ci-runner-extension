package engine

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/mittwald/api-client-go/mittwaldv2/generated/clients/containerclientv2"
	"github.com/mittwald/api-client-go/mittwaldv2/generated/schemas/containerv2"

	"github.com/hermsi1337/mstudio-ci-runner-extension/docker/docker-api/internal/state"
)

// Volumes are stack volumes. Like containers, the engine only knows the ones
// it created: a record in the state directory marks them, so a client can
// neither list nor remove the data volume of a runner.

const ErrNoSuchVolume = notFound("no such volume")

type Volume struct {
	Name    string            `json:"name"`
	Created time.Time         `json:"created"`
	Labels  map[string]string `json:"labels,omitempty"`
	Size    int64             `json:"-"`
	Users   int               `json:"-"`
}

func (e *Engine) volumePath(name string) string {
	return filepath.Join(e.cfg.StateDir, "volumes", name+".json")
}

// VolumeName is the stack volume a Docker volume name maps to.
func VolumeName(name string) string {
	return sanitizeName(name)
}

func (e *Engine) recordVolume(name string, labels map[string]string) (*Volume, error) {
	name = VolumeName(name)
	var existing Volume
	if state.ReadJSON(e.volumePath(name), &existing) == nil {
		return &existing, nil
	}
	v := &Volume{Name: name, Created: time.Now().UTC(), Labels: labels}
	return v, state.WriteJSON(e.volumePath(name), v)
}

func (e *Engine) ownVolumes() []*Volume {
	entries, _ := os.ReadDir(filepath.Join(e.cfg.StateDir, "volumes"))
	var list []*Volume
	for _, entry := range entries {
		var v Volume
		if state.ReadJSON(filepath.Join(e.cfg.StateDir, "volumes", entry.Name()), &v) == nil {
			list = append(list, &v)
		}
	}
	sort.Slice(list, func(i, j int) bool { return list[i].Name < list[j].Name })
	return list
}

func (e *Engine) stackVolumes(ctx context.Context) (map[string]containerv2.VolumeResponse, error) {
	list, _, err := e.client.ListStackVolumes(ctx, containerclientv2.ListStackVolumesRequest{StackID: e.cfg.StackID})
	if err != nil {
		return nil, fmt.Errorf("list volumes: %w", err)
	}
	byName := map[string]containerv2.VolumeResponse{}
	if list != nil {
		for _, v := range *list {
			byName[v.Name] = v
		}
	}
	return byName, nil
}

func withUsage(v *Volume, stack map[string]containerv2.VolumeResponse) *Volume {
	if s, ok := stack[v.Name]; ok {
		v.Size = s.StorageUsageInBytes
		v.Users = len(s.LinkedServices)
	}
	return v
}

func (e *Engine) CreateVolume(ctx context.Context, name string, labels map[string]string) (*Volume, error) {
	if name == "" {
		name = newID()[:16]
	}
	v, err := e.recordVolume(name, labels)
	if err != nil {
		return nil, err
	}
	n := v.Name
	if err := e.updateStack(ctx, containerclientv2.UpdateStackRequestBody{
		Volumes: map[string]containerv2.VolumeRequest{v.Name: {Name: &n}},
	}); err != nil {
		_ = os.Remove(e.volumePath(v.Name))
		return nil, err
	}
	return v, nil
}

func (e *Engine) Volumes(ctx context.Context) ([]*Volume, error) {
	stack, err := e.stackVolumes(ctx)
	if err != nil {
		return nil, err
	}
	var list []*Volume
	for _, v := range e.ownVolumes() {
		list = append(list, withUsage(v, stack))
	}
	return list, nil
}

func (e *Engine) Volume(ctx context.Context, name string) (*Volume, error) {
	var v Volume
	if state.ReadJSON(e.volumePath(VolumeName(name)), &v) != nil {
		return nil, fmt.Errorf("%w: %s", ErrNoSuchVolume, name)
	}
	stack, err := e.stackVolumes(ctx)
	if err != nil {
		return nil, err
	}
	return withUsage(&v, stack), nil
}

func (e *Engine) RemoveVolume(ctx context.Context, name string) error {
	v, err := e.Volume(ctx, name)
	if err != nil {
		return err
	}
	for _, c := range e.containers() {
		for _, spec := range c.Volumes {
			if source, _, _ := strings.Cut(spec, ":"); source == v.Name {
				return fmt.Errorf("%w: volume %s is in use by container %s", ErrConflict, v.Name, c.ID[:12])
			}
		}
	}
	stack, err := e.stackVolumes(ctx)
	if err != nil {
		return err
	}
	if s, ok := stack[v.Name]; ok {
		res, err := e.client.DeleteVolume(ctx, containerclientv2.DeleteVolumeRequest{StackID: e.cfg.StackID, VolumeID: s.Id})
		if err != nil {
			if res != nil && res.StatusCode == 412 {
				return fmt.Errorf("%w: volume %s is still in use on the platform, try again in a moment", ErrConflict, v.Name)
			}
			return fmt.Errorf("delete volume %s: %w", v.Name, err)
		}
	}
	return os.Remove(e.volumePath(v.Name))
}

// PruneVolumes removes the volumes of the engine no container uses.
func (e *Engine) PruneVolumes(ctx context.Context) ([]string, int64) {
	var removed []string
	var reclaimed int64
	list, _ := e.Volumes(ctx)
	for _, v := range list {
		if e.RemoveVolume(ctx, v.Name) == nil {
			removed = append(removed, v.Name)
			reclaimed += v.Size
		}
	}
	return removed, reclaimed
}
