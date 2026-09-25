package handlers

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"

	"github.com/gorilla/mux"
	dockerspec "github.com/moby/docker-image-spec/specs-go/v1"
	"github.com/moby/moby/api/types/image"
	"github.com/moby/moby/api/types/jsonstream"
	ocispec "github.com/opencontainers/image-spec/specs-go/v1"

	"github.com/mittwald/mittwald-container-adapter/internal/engine"
)

// ImageHandler answers from the registry lookup of the mittwald API. Images
// are never stored here: the platform pulls them when a service starts.
type ImageHandler struct {
	engine *engine.Engine
}

func NewImageHandler(e *engine.Engine) *ImageHandler {
	return &ImageHandler{engine: e}
}

func imageID(img *engine.Image) string {
	if img.Digest != "" {
		return img.Digest
	}
	return "sha256:" + strings.Repeat("0", 64)
}

func (h *ImageHandler) List(w http.ResponseWriter, r *http.Request) {
	list := []image.Summary{}
	for _, img := range h.engine.Images().Known() {
		list = append(list, image.Summary{
			ID:          imageID(img),
			RepoTags:    []string{img.Reference},
			RepoDigests: []string{},
			Labels:      map[string]string{},
			Containers:  -1,
			Created:     img.Resolved.Unix(),
		})
	}
	writeJSON(w, http.StatusOK, list)
}

func (h *ImageHandler) Pull(w http.ResponseWriter, r *http.Request) {
	name := r.URL.Query().Get("fromImage")
	tag := r.URL.Query().Get("tag")
	if name == "" {
		writeError(w, http.StatusBadRequest, "fromImage parameter is required")
		return
	}
	if tag != "" {
		if strings.HasPrefix(tag, "sha256:") {
			name += "@" + tag
		} else {
			name += ":" + tag
		}
	}
	img, err := h.engine.Images().Resolve(r.Context(), name)
	if err != nil {
		if errors.Is(err, engine.ErrNotFound) {
			writeError(w, http.StatusNotFound, fmt.Sprintf("pull access denied for %s, repository does not exist or may require authorization", name))
			return
		}
		writeEngineError(w, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	encoder := json.NewEncoder(w)
	for _, msg := range []jsonstream.Message{
		{Status: "Pulling from " + name},
		{Status: "Digest: " + img.Digest},
		{Status: "Status: Image is resolved, mittwald pulls it when the container starts"},
	} {
		_ = encoder.Encode(msg)
	}
}

func (h *ImageHandler) Inspect(w http.ResponseWriter, r *http.Request) {
	name := mux.Vars(r)["name"]
	img, err := h.engine.Images().Resolve(r.Context(), name)
	if err != nil {
		writeEngineError(w, err)
		return
	}
	ports := map[string]struct{}{}
	for _, p := range img.ExposedPorts {
		ports[p] = struct{}{}
	}
	writeJSON(w, http.StatusOK, image.InspectResponse{
		ID:           imageID(img),
		RepoTags:     []string{img.Reference},
		RepoDigests:  []string{},
		Architecture: "amd64",
		Os:           "linux",
		Config: &dockerspec.DockerOCIImageConfig{ImageConfig: ocispec.ImageConfig{
			User:         img.User,
			ExposedPorts: ports,
			Env:          img.Env,
			Entrypoint:   img.Entrypoint,
			Cmd:          img.Cmd,
		}},
		RootFS: image.RootFS{Type: "layers", Layers: []string{}},
	})
}

func (h *ImageHandler) Remove(w http.ResponseWriter, r *http.Request) {
	name := mux.Vars(r)["name"]
	if !h.engine.Images().Forget(name) {
		writeError(w, http.StatusNotFound, "No such image: "+name)
		return
	}
	writeJSON(w, http.StatusOK, []image.DeleteResponse{{Untagged: name}})
}

func (h *ImageHandler) Tag(w http.ResponseWriter, r *http.Request) {
	w.WriteHeader(http.StatusCreated)
}

func (h *ImageHandler) Search(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, []any{})
}

func (h *ImageHandler) History(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, []any{})
}

func (h *ImageHandler) Build(w http.ResponseWriter, r *http.Request) {
	writeError(w, http.StatusNotImplemented, "building images is not supported by the adapter; build and push the image in the pipeline, then run it from the registry")
}
