package handlers

import (
	"encoding/base64"
	"testing"
)

func TestRegistryAuthDecodesTheDockerHeader(t *testing.T) {
	body := `{"username":"ci","password":"secret","serveraddress":"ghcr.io"}`
	for _, enc := range []*base64.Encoding{base64.URLEncoding, base64.StdEncoding, base64.RawURLEncoding} {
		cfg, ok := registryAuth(enc.EncodeToString([]byte(body)))
		if !ok || cfg.Username != "ci" || cfg.Password != "secret" {
			t.Errorf("%v: got %+v, %v", enc, cfg, ok)
		}
	}
	for _, header := range []string{"", "not base64 !", base64.URLEncoding.EncodeToString([]byte("{}"))} {
		if _, ok := registryAuth(header); ok {
			t.Errorf("header %q accepted", header)
		}
	}
}
