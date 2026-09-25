package engine

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"runtime"
	"sort"
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
func registryImage(ctx context.Context, ref string, auth authn.Authenticator) (*Image, error) {
	parsed, err := name.ParseReference(ref)
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrInvalid, err)
	}
	ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()
	desc, err := remote.Get(parsed,
		remote.WithContext(ctx),
		remote.WithAuth(auth),
		remote.WithPlatform(v1.Platform{OS: "linux", Architecture: runtime.GOARCH}),
	)
	if err != nil {
		var terr *transport.Error
		if errors.As(err, &terr) {
			switch terr.StatusCode {
			case http.StatusNotFound:
				return nil, fmt.Errorf("%w: %s", ErrImageNotFound, ref)
			case http.StatusUnauthorized, http.StatusForbidden:
				// Reported as missing, so Docker clients pull it with the
				// credentials from docker login.
				return nil, fmt.Errorf("%w: %s requires authorization", ErrImageNotFound, ref)
			}
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
	return &Image{
		Reference:    ref,
		Digest:       desc.Digest.String(),
		Entrypoint:   cfg.Config.Entrypoint,
		Cmd:          cfg.Config.Cmd,
		Env:          cfg.Config.Env,
		ExposedPorts: ports,
		User:         cfg.Config.User,
		Resolved:     time.Now(),
	}, nil
}

func registryHost(ref string) string {
	parsed, err := name.ParseReference(ref)
	if err != nil {
		return ""
	}
	return parsed.Context().RegistryStr()
}
