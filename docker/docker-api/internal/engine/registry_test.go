package engine

import (
	"context"
	"errors"
	"net/http/httptest"
	"strings"
	"testing"

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

	img, err := registryImage(context.Background(), ref)
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
	_, err := registryImage(context.Background(), strings.TrimPrefix(server.URL, "http://")+"/nope:1")
	if !errors.Is(err, ErrImageNotFound) {
		t.Fatalf("expected ErrImageNotFound, got %v", err)
	}
}
