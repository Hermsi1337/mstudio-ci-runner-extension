package engine

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
	"time"

	"github.com/google/go-containerregistry/pkg/authn"
	"github.com/google/go-containerregistry/pkg/name"
	v1 "github.com/google/go-containerregistry/pkg/v1"
	"github.com/google/go-containerregistry/pkg/v1/remote"
	"github.com/google/go-containerregistry/pkg/v1/remote/transport"
)

// registryImage reads the config of an image from its registry, anonymously
// unless a client sent credentials for that registry. The platform pulls the
// image itself when the service starts, with the registries of the project;
// the adapter only needs entrypoint, command, environment and ports to wrap
// the process.
func registryImage(ctx context.Context, ref string, auth authn.Authenticator, cacheDir string) (*Image, error) {
	parsed, err := name.ParseReference(ref)
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrInvalid, err)
	}
	ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()
	options := []remote.Option{
		remote.WithContext(ctx),
		remote.WithAuth(auth),
		remote.WithPlatform(v1.Platform{OS: "linux", Architecture: runtime.GOARCH}),
	}
	// A HEAD does not count against the Docker Hub rate limit, a GET of the
	// manifest does. Configs are stored by manifest digest, so an image read
	// once costs only HEAD requests afterwards, across restarts.
	var cachePath string
	if cacheDir != "" {
		if head, err := remote.Head(parsed, options...); err == nil {
			cachePath = filepath.Join(cacheDir, strings.ReplaceAll(head.Digest.String(), ":", "-")+".json")
			var cached Image
			if data, err := os.ReadFile(cachePath); err == nil && json.Unmarshal(data, &cached) == nil {
				cached.Reference = ref
				cached.Resolved = time.Now()
				return &cached, nil
			}
		} else if err := registryError(ref, err); err != nil && !errors.Is(err, errRetryWithGet) {
			return nil, err
		}
	}
	desc, err := remote.Get(parsed, options...)
	if err != nil {
		if rerr := registryError(ref, err); rerr != nil && !errors.Is(rerr, errRetryWithGet) {
			return nil, rerr
		}
		return nil, err
	}
	image, err := desc.Image()
	if err != nil {
		return nil, err
	}
	cfg, err := image.ConfigFile()
	if err != nil {
		return nil, err
	}
	var ports []string
	for port := range cfg.Config.ExposedPorts {
		ports = append(ports, port)
	}
	sort.Strings(ports)
	img := &Image{
		Reference:    ref,
		Digest:       desc.Digest.String(),
		Entrypoint:   cfg.Config.Entrypoint,
		Cmd:          cfg.Config.Cmd,
		Env:          cfg.Config.Env,
		ExposedPorts: ports,
		User:         cfg.Config.User,
		Resolved:     time.Now(),
	}
	if cachePath != "" {
		if data, err := json.Marshal(img); err == nil {
			_ = os.WriteFile(cachePath, data, 0o644)
		}
	}
	return img, nil
}

var errRetryWithGet = errors.New("retry with GET")

// registryError maps the answers of a registry to what Docker clients expect.
func registryError(ref string, err error) error {
	var terr *transport.Error
	if !errors.As(err, &terr) {
		return errRetryWithGet
	}
	switch terr.StatusCode {
	case http.StatusNotFound:
		return fmt.Errorf("%w: %s", ErrImageNotFound, ref)
	case http.StatusUnauthorized, http.StatusForbidden:
		// Reported as missing, so Docker clients pull it with the
		// credentials from docker login.
		return fmt.Errorf("%w: %s requires authorization", ErrImageNotFound, ref)
	case http.StatusTooManyRequests:
		return fmt.Errorf("%w: the registry of %s limits requests (429, for Docker Hub the pull rate limit of the project's address); docker login raises the limit", ErrUnavailable, ref)
	}
	return errRetryWithGet
}

func registryHost(ref string) string {
	parsed, err := name.ParseReference(ref)
	if err != nil {
		return ""
	}
	return parsed.Context().RegistryStr()
}
