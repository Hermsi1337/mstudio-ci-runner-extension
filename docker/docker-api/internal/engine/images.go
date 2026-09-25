package engine

import (
	"context"
	"fmt"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/mittwald/api-client-go/mittwaldv2/generated/clients/containerclientv2"

	"github.com/hermsi1337/mstudio-ci-runner-extension/docker/docker-api/internal/mittwald"
)

var ErrImageNotFound = fmt.Errorf("%w: no such image", ErrNotFound)

// Image is what the engine knows about an image without pulling it: the
// registry lookup of the mittwald API returns the config of the image.
type Image struct {
	Reference    string
	Digest       string
	Entrypoint   []string
	Cmd          []string
	Env          []string
	ExposedPorts []string
	User         string
	Resolved     time.Time
}

type ImageResolver struct {
	client    mittwald.ContainerClient
	projectID string
	mu        sync.Mutex
	cache     map[string]*Image
}

func NewImageResolver(client mittwald.ContainerClient, projectID string) *ImageResolver {
	return &ImageResolver{client: client, projectID: projectID, cache: map[string]*Image{}}
}

// Normalize adds the tag Docker would add.
func Normalize(ref string) string {
	if strings.Contains(ref, "@") {
		return ref
	}
	lastSlash := strings.LastIndex(ref, "/")
	if !strings.Contains(ref[lastSlash+1:], ":") {
		return ref + ":latest"
	}
	return ref
}

func (r *ImageResolver) Resolve(ctx context.Context, ref string) (*Image, error) {
	ref = Normalize(ref)
	r.mu.Lock()
	cached, ok := r.cache[ref]
	r.mu.Unlock()
	if ok && time.Since(cached.Resolved) < 10*time.Minute {
		return cached, nil
	}
	noAI := false
	cfg, res, err := r.client.GetContainerImageConfig(ctx, containerclientv2.GetContainerImageConfigRequest{
		ImageReference:             ref,
		UseCredentialsForProjectID: &r.projectID,
		GenerateAIData:             &noAI,
	})
	if res != nil && (res.StatusCode == http.StatusNotFound || res.StatusCode == http.StatusBadRequest) {
		return nil, fmt.Errorf("%w: %s", ErrImageNotFound, ref)
	}
	if err != nil {
		return nil, fmt.Errorf("look up image %s: %w", ref, err)
	}
	img := &Image{
		Reference:  ref,
		Digest:     cfg.Digest,
		Entrypoint: cfg.Entrypoint,
		Cmd:        cfg.Command,
		User:       cfg.User,
		Resolved:   time.Now(),
	}
	for _, env := range cfg.Env {
		if env.IsAiGenerated || env.Value == nil {
			continue
		}
		img.Env = append(img.Env, env.Key+"="+*env.Value)
	}
	for _, p := range cfg.ExposedPorts {
		if !p.IsAiGenerated {
			port := p.Port
			if !strings.Contains(port, "/") {
				port += "/tcp"
			}
			img.ExposedPorts = append(img.ExposedPorts, port)
		}
	}
	r.mu.Lock()
	r.cache[ref] = img
	r.mu.Unlock()
	return img, nil
}

func (r *ImageResolver) Known() []*Image {
	r.mu.Lock()
	defer r.mu.Unlock()
	list := make([]*Image, 0, len(r.cache))
	for _, img := range r.cache {
		list = append(list, img)
	}
	return list
}

func (r *ImageResolver) Forget(ref string) bool {
	ref = Normalize(ref)
	r.mu.Lock()
	defer r.mu.Unlock()
	_, ok := r.cache[ref]
	delete(r.cache, ref)
	return ok
}

func (e *Engine) Images() *ImageResolver { return e.images }
