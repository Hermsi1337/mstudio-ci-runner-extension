package engine

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"

	"github.com/google/go-containerregistry/pkg/authn"
	"github.com/google/go-containerregistry/pkg/name"
	"github.com/google/go-containerregistry/pkg/registry"
	v1 "github.com/google/go-containerregistry/pkg/v1"
	"github.com/google/go-containerregistry/pkg/v1/mutate"
	"github.com/google/go-containerregistry/pkg/v1/random"
	"github.com/google/go-containerregistry/pkg/v1/remote"
)

func pushImage(t *testing.T, host string) string {
	t.Helper()
	base, err := random.Image(64, 1)
	if err != nil {
		t.Fatal(err)
	}
	img, err := mutate.Config(base, v1.Config{
		Entrypoint:   []string{"docker-entrypoint.sh"},
		Cmd:          []string{"postgres"},
		Env:          []string{"PGDATA=/var/lib/postgresql/data"},
		ExposedPorts: map[string]struct{}{"5432/tcp": {}},
		User:         "postgres",
	})
	if err != nil {
		t.Fatal(err)
	}
	ref := host + "/library/postgres:16"
	parsed, err := name.ParseReference(ref)
	if err != nil {
		t.Fatal(err)
	}
	if err := remote.Write(parsed, img); err != nil {
		t.Fatal(err)
	}
	return ref
}

func TestRegistryImageReadsTheConfig(t *testing.T) {
	server := httptest.NewServer(registry.New())
	defer server.Close()
	ref := pushImage(t, strings.TrimPrefix(server.URL, "http://"))

	img, err := registryImage(context.Background(), ref, authn.Anonymous, "")
	if err != nil {
		t.Fatal(err)
	}
	if strings.Join(img.Entrypoint, " ") != "docker-entrypoint.sh" || strings.Join(img.Cmd, " ") != "postgres" {
		t.Errorf("entrypoint %v cmd %v", img.Entrypoint, img.Cmd)
	}
	if len(img.ExposedPorts) != 1 || img.ExposedPorts[0] != "5432/tcp" {
		t.Errorf("ports %v", img.ExposedPorts)
	}
	if img.User != "postgres" || !strings.HasPrefix(img.Digest, "sha256:") {
		t.Errorf("user %q digest %q", img.User, img.Digest)
	}
}

func TestRegistryImageReportsAMissingImage(t *testing.T) {
	server := httptest.NewServer(registry.New())
	defer server.Close()
	_, err := registryImage(context.Background(), strings.TrimPrefix(server.URL, "http://")+"/nope:1", authn.Anonymous, "")
	if !errors.Is(err, ErrImageNotFound) {
		t.Fatalf("expected ErrImageNotFound, got %v", err)
	}
}

// privateRegistry demands basic auth, like a private registry that allows no
// anonymous reads.
func privateRegistry(t *testing.T) (*httptest.Server, string) {
	t.Helper()
	inner := registry.New()
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if user, pass, ok := r.BasicAuth(); !ok || user != "ci" || pass != "secret" {
			w.Header().Set("WWW-Authenticate", `Basic realm="registry"`)
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		inner.ServeHTTP(w, r)
	}))
	host := strings.TrimPrefix(server.URL, "http://")
	ref := host + "/private/app:1"
	parsed, err := name.ParseReference(ref)
	if err != nil {
		t.Fatal(err)
	}
	img, err := random.Image(64, 1)
	if err != nil {
		t.Fatal(err)
	}
	if err := remote.Write(parsed, img, remote.WithAuth(&authn.Basic{Username: "ci", Password: "secret"})); err != nil {
		t.Fatal(err)
	}
	return server, ref
}

func TestPrivateImageIsMissingWithoutCredentials(t *testing.T) {
	server, ref := privateRegistry(t)
	defer server.Close()
	_, err := registryImage(context.Background(), ref, authn.Anonymous, "")
	if !errors.Is(err, ErrImageNotFound) {
		t.Fatalf("expected ErrImageNotFound, got %v", err)
	}
}

func TestResolverUsesCredentialsFromAPull(t *testing.T) {
	server, ref := privateRegistry(t)
	defer server.Close()
	resolver := NewImageResolver(nil, "p", true, t.TempDir())
	if _, err := resolver.Resolve(context.Background(), ref); !errors.Is(err, ErrImageNotFound) {
		t.Fatalf("expected ErrImageNotFound before login, got %v", err)
	}
	resolver.Authorize(ref, authn.AuthConfig{Username: "ci", Password: "secret"})
	img, err := resolver.Resolve(context.Background(), ref)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(img.Digest, "sha256:") {
		t.Errorf("digest %q", img.Digest)
	}
}

func TestRegistryImageServesTheCacheAfterAHead(t *testing.T) {
	server := httptest.NewServer(registry.New())
	defer server.Close()
	ref := pushImage(t, strings.TrimPrefix(server.URL, "http://"))
	dir := t.TempDir()
	first, err := registryImage(context.Background(), ref, authn.Anonymous, dir)
	if err != nil {
		t.Fatal(err)
	}
	entries, _ := os.ReadDir(dir)
	if len(entries) != 1 {
		t.Fatalf("cache holds %d entries, want 1", len(entries))
	}
	second, err := registryImage(context.Background(), ref, authn.Anonymous, dir)
	if err != nil {
		t.Fatal(err)
	}
	if second.Digest != first.Digest || strings.Join(second.Cmd, " ") != "postgres" {
		t.Errorf("cached image %+v differs from %+v", second, first)
	}
}
