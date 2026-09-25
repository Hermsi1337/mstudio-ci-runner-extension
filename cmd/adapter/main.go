package main

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"

	"github.com/mittwald/api-client-go/mittwaldv2"
	"github.com/mittwald/api-client-go/mittwaldv2/generated/clients/projectclientv2"

	"github.com/mittwald/mittwald-container-adapter/internal/config"
	"github.com/mittwald/mittwald-container-adapter/internal/docker"
	"github.com/mittwald/mittwald-container-adapter/internal/engine"
	"github.com/mittwald/mittwald-container-adapter/internal/initproc"
	"github.com/mittwald/mittwald-container-adapter/internal/state"
)

// version is set at build time with -ldflags "-X main.version=...".
var version = "dev"

func main() {
	// The same binary is the entrypoint of every container the adapter runs,
	// installed there as mstudio-init.
	if filepath.Base(os.Args[0]) == state.InitBinary || (len(os.Args) > 1 && os.Args[1] == "init") {
		self := state.SelfDir
		if dir := os.Getenv("MSTUDIO_INIT_SELF"); dir != "" {
			self = dir
		}
		if err := initproc.Run(state.Dir(self)); err != nil {
			fmt.Fprintln(os.Stderr, "[mstudio-init]", err)
			os.Exit(1)
		}
		return
	}

	cfg, err := config.Load()
	if err != nil {
		slog.Error("Failed to load configuration", "error", err)
		os.Exit(1)
	}

	logger := slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{Level: cfg.LogLevel}))
	slog.SetDefault(logger)
	ctx := context.Background()

	options := []mittwaldv2.ClientOption{
		mittwaldv2.WithAccessToken(cfg.MittwaldAPIToken),
		mittwaldv2.WithRequestLogging(logger, false, true),
	}
	if cfg.MittwaldAPIBaseURL != "" {
		options = append(options, mittwaldv2.WithBaseURL(cfg.MittwaldAPIBaseURL))
	}
	client, err := mittwaldv2.New(ctx, options...)
	if err != nil {
		slog.Error("Failed to create mittwald client", "error", err)
		os.Exit(1)
	}

	project, _, err := client.Project().GetProject(ctx, projectclientv2.GetProjectRequest{ProjectID: cfg.MittwaldProjectID})
	if err != nil {
		slog.Error("Failed to read the project", "error", err)
		os.Exit(1)
	}
	home := project.Directories["Home"]
	if home == "" {
		home = "/home/" + project.ShortId
	}
	stateHostPath := cfg.StateHostPath
	if stateHostPath == "" {
		stateHostPath = filepath.Join(home, ".docker-adapter", cfg.MittwaldStackID)
	}

	eng, err := engine.New(engine.Config{
		ProjectID:        cfg.MittwaldProjectID,
		StackID:          cfg.MittwaldStackID,
		StateDir:         cfg.StateDir,
		StateHostPath:    stateHostPath,
		ProjectHome:      home,
		BindTranslations: cfg.BindTranslations,
		DefaultCPUs:      cfg.DefaultCPUs,
		DefaultMemory:    cfg.DefaultMemory,
		Logger:           logger,
	}, client.Container())
	if err != nil {
		slog.Error("Failed to set up the engine", "error", err)
		os.Exit(1)
	}
	if err := eng.InstallInit(); err != nil {
		slog.Error("Failed to install mstudio-init into the state directory", "error", err)
		os.Exit(1)
	}
	eng.Restore(ctx)

	slog.Info("Starting mittwald Docker API adapter",
		"version", version,
		"addr", cfg.ListenAddress(),
		"project", cfg.MittwaldProjectID,
		"stack", cfg.MittwaldStackID,
		"stateDir", cfg.StateDir,
		"stateHostPath", stateHostPath,
	)

	router := docker.NewRouter(docker.RouterConfig{
		Engine:          eng,
		ContainerClient: client.Container(),
		ProjectID:       cfg.MittwaldProjectID,
		StackID:         cfg.MittwaldStackID,
		Logger:          logger,
	})

	if err := http.ListenAndServe(cfg.ListenAddress(), router); err != nil {
		slog.Error("Server failed", "error", err)
		os.Exit(1)
	}
}
