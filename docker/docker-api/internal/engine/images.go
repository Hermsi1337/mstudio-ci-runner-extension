package engine

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/google/go-containerregistry/pkg/authn"
	"github.com/mittwald/api-client-go/mittwaldv2/generated/clients/containerclientv2"

	"github.com/hermsi1337/mstudio-ci-runner-extension/docker/docker-api/internal/mittwald"
)

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

// ImageResolver reads image configs from the registry itself and falls back
// to the lookup of the mittwald API, which refuses extension tokens.
type ImageResolver struct {
	client    mittwald.ContainerClient
	projectID string
	registry  func(ctx context.Context, ref string, auth authn.Authenticator) (*Image, error)
	mu        sync.Mutex
	cache     map[string]*Image
	// Credentials clients sent with a pull (X-Registry-Auth), by registry
	// host. Kept in memory only; every job of the stack shares them, like
	// the stack shares everything else.
	auth map[string]authn.AuthConfig
}

func NewImageResolver(client mittwald.ContainerClient, projectID string, useRegistry bool) *ImageResolver {
	r := &ImageResolver{client: client, projectID: projectID, cache: map[string]*Image{}, auth: map[string]authn.AuthConfig{}}
	if useRegistry {
		r.registry = registryImage
	}
	return r
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
	var registryErr error
	if r.registry != nil {
		img, err := r.registry(ctx, ref, r.authenticator(ref))
		if err == nil {
			r.remember(img)
			return img, nil
		}
		if errors.Is(err, ErrImageNotFound) {
			return nil, err
		}
		registryErr = err
	}
	img, err := r.fromMittwald(ctx, ref)
	if err != nil && registryErr != nil {
		return nil, fmt.Errorf("look up image %s: registry: %v; mittwald: %w", ref, registryErr, err)
	}
	if err != nil {
		return nil, err
	}
	r.remember(img)
	return img, nil
}

// Authorize stores credentials for the registry of ref. A client sends them
// with a pull, after the image lookup told it the image does not exist.
func (r *ImageResolver) Authorize(ref string, cfg authn.AuthConfig) {
	host := registryHost(ref)
	if host == "" {
		return
	}
	r.mu.Lock()
	r.auth[host] = cfg
	r.mu.Unlock()
}

func (r *ImageResolver) authenticator(ref string) authn.Authenticator {
	r.mu.Lock()
	defer r.mu.Unlock()
	if cfg, ok := r.auth[registryHost(ref)]; ok {
		return authn.FromConfig(cfg)
	}
	return authn.Anonymous
}

func (r *ImageResolver) remember(img *Image) {
	r.mu.Lock()
	r.cache[img.Reference] = img
	r.mu.Unlock()
}

func (r *ImageResolver) fromMittwald(ctx context.Context, ref string) (*Image, error) {
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
