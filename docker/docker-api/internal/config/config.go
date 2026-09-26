package config

import (
	"errors"
	"fmt"
	"log/slog"
	"os"
	"strings"
)

type Config struct {
	MittwaldAPIToken   string
	DockerAPITokenURL  string
	DockerAPISecret    string
	MittwaldAPIBaseURL string
	MittwaldProjectID  string
	MittwaldStackID    string
	AdapterPort        string
	AdapterHost        string

	StateDir         string
	StateHostPath    string
	BindTranslations map[string]string
	DefaultCPUs      string
	DefaultMemory    string
	LogLevel         slog.Level
}

func Load() (*Config, error) {
	cfg := &Config{
		MittwaldAPIToken:   os.Getenv("MITTWALD_API_TOKEN"),
		DockerAPITokenURL:  os.Getenv("DOCKER_API_TOKEN_URL"),
		DockerAPISecret:    os.Getenv("DOCKER_API_SECRET"),
		MittwaldAPIBaseURL: os.Getenv("MITTWALD_API_BASE_URL"),
		MittwaldProjectID:  os.Getenv("MITTWALD_PROJECT_ID"),
		MittwaldStackID:    os.Getenv("MITTWALD_STACK_ID"),
		AdapterPort:        envOr("ADAPTER_PORT", "2375"),
		AdapterHost:        envOr("ADAPTER_HOST", "0.0.0.0"),
		StateDir:           envOr("STATE_DIR", "/state"),
		StateHostPath:      os.Getenv("STATE_HOST_PATH"),
		DefaultCPUs:        envOr("DEFAULT_CPUS", "1"),
		DefaultMemory:      envOr("DEFAULT_MEMORY", "2048mb"),
		BindTranslations:   map[string]string{},
	}

	if (cfg.DockerAPITokenURL == "") != (cfg.DockerAPISecret == "") {
		return nil, errors.New("DOCKER_API_TOKEN_URL and DOCKER_API_SECRET must be set together")
	}
	if cfg.MittwaldAPIToken == "" && !cfg.UsesTokenSource() {
		return nil, errors.New("set either MITTWALD_API_TOKEN or both DOCKER_API_TOKEN_URL and DOCKER_API_SECRET")
	}
	if cfg.MittwaldProjectID == "" {
		return nil, errors.New("MITTWALD_PROJECT_ID environment variable is required")
	}
	if cfg.MittwaldStackID == "" {
		cfg.MittwaldStackID = cfg.MittwaldProjectID
	}
	for _, pair := range strings.Split(os.Getenv("BIND_TRANSLATIONS"), ",") {
		pair = strings.TrimSpace(pair)
		if pair == "" {
			continue
		}
		from, to, ok := strings.Cut(pair, "=")
		if !ok || !strings.HasPrefix(from, "/") || !strings.HasPrefix(to, "/") {
			return nil, fmt.Errorf("BIND_TRANSLATIONS entry %q is not of the form /client/path=/project/path", pair)
		}
		cfg.BindTranslations[from] = to
	}
	if err := cfg.LogLevel.UnmarshalText([]byte(envOr("LOG_LEVEL", "info"))); err != nil {
		return nil, fmt.Errorf("LOG_LEVEL: %w", err)
	}
	return cfg, nil
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func (c *Config) ListenAddress() string {
	return c.AdapterHost + ":" + c.AdapterPort
}

func (c *Config) UsesTokenSource() bool {
	return c.DockerAPITokenURL != ""
}
