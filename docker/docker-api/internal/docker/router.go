package docker

import (
	"log/slog"
	"net/http"
	"regexp"

	"github.com/gorilla/mux"

	"github.com/hermsi1337/mstudio-ci-runner-extension/docker/docker-api/internal/adapter"
	"github.com/hermsi1337/mstudio-ci-runner-extension/docker/docker-api/internal/docker/handlers"
	"github.com/hermsi1337/mstudio-ci-runner-extension/docker/docker-api/internal/engine"
	"github.com/hermsi1337/mstudio-ci-runner-extension/docker/docker-api/internal/mittwald"
)

// RouterConfig holds the configuration for creating a new router.
type RouterConfig struct {
	Engine          *engine.Engine
	ContainerClient mittwald.ContainerClient
	ProjectID       string
	StackID         string
	Logger          *slog.Logger
}

var versionPrefix = regexp.MustCompile(`^/v[0-9.]+/`)

func NewRouter(cfg RouterConfig) http.Handler {
	volumeAdapter := adapter.NewVolumeAdapter(cfg.ContainerClient, cfg.ProjectID, cfg.StackID)

	system := handlers.NewSystemHandler(cfg.ProjectID, cfg.StackID)
	containers := handlers.NewContainerHandler(cfg.Engine)
	images := handlers.NewImageHandler(cfg.Engine)
	volumes := handlers.NewVolumeHandler(volumeAdapter)
	networks := handlers.NewNetworkHandler(cfg.Engine)
	execs := handlers.NewExecHandler(cfg.Engine)

	router := mux.NewRouter()

	router.HandleFunc("/_ping", system.Ping).Methods("GET", "HEAD")
	router.HandleFunc("/version", system.Version).Methods("GET")
	router.HandleFunc("/info", system.Info).Methods("GET")

	router.HandleFunc("/containers/json", containers.List).Methods("GET")
	router.HandleFunc("/containers/create", containers.Create).Methods("POST")
	router.HandleFunc("/containers/{id}/json", containers.Inspect).Methods("GET")
	router.HandleFunc("/containers/{id}/start", containers.Start).Methods("POST")
	router.HandleFunc("/containers/{id}/stop", containers.Stop).Methods("POST")
	router.HandleFunc("/containers/{id}/restart", containers.Restart).Methods("POST")
	router.HandleFunc("/containers/{id}/kill", containers.Kill).Methods("POST")
	router.HandleFunc("/containers/{id}/wait", containers.Wait).Methods("POST")
	router.HandleFunc("/containers/{id}/attach", containers.Attach).Methods("POST")
	router.HandleFunc("/containers/{id}/logs", containers.Logs).Methods("GET")
	router.HandleFunc("/containers/{id}/top", containers.Top).Methods("GET")
	router.HandleFunc("/containers/{id}/stats", containers.Stats).Methods("GET")
	router.HandleFunc("/containers/{id}/archive", containers.ArchiveHead).Methods("HEAD")
	router.HandleFunc("/containers/{id}/archive", containers.ArchiveGet).Methods("GET")
	router.HandleFunc("/containers/{id}/archive", containers.ArchivePut).Methods("PUT")
	router.HandleFunc("/containers/{id}", containers.Remove).Methods("DELETE")

	router.HandleFunc("/build", images.Build).Methods("POST")
	router.HandleFunc("/images/json", images.List).Methods("GET")
	router.HandleFunc("/images/create", images.Pull).Methods("POST")
	router.HandleFunc("/images/search", images.Search).Methods("GET")
	router.HandleFunc("/images/{name:.*}/json", images.Inspect).Methods("GET")
	router.HandleFunc("/images/{name:.*}/tag", images.Tag).Methods("POST")
	router.HandleFunc("/images/{name:.*}/history", images.History).Methods("GET")
	router.HandleFunc("/images/{name:.*}", images.Remove).Methods("DELETE")

	router.HandleFunc("/volumes", volumes.List).Methods("GET")
	router.HandleFunc("/volumes/create", volumes.Create).Methods("POST")
	router.HandleFunc("/volumes/prune", volumes.Prune).Methods("POST")
	router.HandleFunc("/volumes/{name}", volumes.Inspect).Methods("GET")
	router.HandleFunc("/volumes/{name}", volumes.Remove).Methods("DELETE")

	router.HandleFunc("/networks", networks.List).Methods("GET")
	router.HandleFunc("/networks/create", networks.Create).Methods("POST")
	router.HandleFunc("/networks/prune", networks.Prune).Methods("POST")
	router.HandleFunc("/networks/{id}", networks.Inspect).Methods("GET")
	router.HandleFunc("/networks/{id}", networks.Remove).Methods("DELETE")
	router.HandleFunc("/networks/{id}/connect", networks.Connect).Methods("POST")
	router.HandleFunc("/networks/{id}/disconnect", networks.Disconnect).Methods("POST")

	router.HandleFunc("/containers/{id}/exec", execs.CreateExec).Methods("POST")
	router.HandleFunc("/exec/{id}/start", execs.StartExec).Methods("POST")
	router.HandleFunc("/exec/{id}/json", execs.InspectExec).Methods("GET")
	router.HandleFunc("/exec/{id}/resize", execs.ResizeExec).Methods("POST")

	unversioned := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if loc := versionPrefix.FindStringIndex(r.URL.Path); loc != nil {
			r2 := r.Clone(r.Context())
			r2.URL.Path = r.URL.Path[loc[1]-1:]
			r2.URL.RawPath = ""
			r2.RequestURI = r2.URL.RequestURI()
			router.ServeHTTP(w, r2)
			return
		}
		router.ServeHTTP(w, r)
	})

	return LoggingMiddleware(unversioned, cfg.Logger)
}
