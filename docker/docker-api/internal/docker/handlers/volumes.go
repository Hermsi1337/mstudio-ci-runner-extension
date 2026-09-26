package handlers

import (
	"encoding/json"
	"net/http"

	"github.com/gorilla/mux"
	"github.com/moby/moby/api/types/volume"

	"github.com/hermsi1337/mstudio-ci-runner-extension/docker/docker-api/internal/engine"
)

type VolumeHandler struct {
	engine *engine.Engine
}

func NewVolumeHandler(e *engine.Engine) *VolumeHandler {
	return &VolumeHandler{engine: e}
}

func toVolume(v *engine.Volume) volume.Volume {
	labels := v.Labels
	if labels == nil {
		labels = map[string]string{}
	}
	return volume.Volume{
		Name:       v.Name,
		Driver:     "local",
		Mountpoint: "/var/lib/docker/volumes/" + v.Name + "/_data",
		CreatedAt:  v.Created.Format("2006-01-02T15:04:05Z07:00"),
		Labels:     labels,
		Scope:      "local",
		Options:    map[string]string{},
		UsageData:  &volume.UsageData{Size: v.Size, RefCount: int64(v.Users)},
	}
}

func (h *VolumeHandler) List(w http.ResponseWriter, r *http.Request) {
	list, err := h.engine.Volumes(r.Context())
	if err != nil {
		writeEngineError(w, err)
		return
	}
	resp := volume.ListResponse{Volumes: []volume.Volume{}, Warnings: []string{}}
	for _, v := range list {
		resp.Volumes = append(resp.Volumes, toVolume(v))
	}
	writeJSON(w, http.StatusOK, resp)
}

func (h *VolumeHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req volume.CreateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid JSON: "+err.Error())
		return
	}
	v, err := h.engine.CreateVolume(r.Context(), req.Name, req.Labels)
	if err != nil {
		writeEngineError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, toVolume(v))
}

func (h *VolumeHandler) Inspect(w http.ResponseWriter, r *http.Request) {
	v, err := h.engine.Volume(r.Context(), mux.Vars(r)["name"])
	if err != nil {
		writeEngineError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, toVolume(v))
}

func (h *VolumeHandler) Remove(w http.ResponseWriter, r *http.Request) {
	if err := h.engine.RemoveVolume(r.Context(), mux.Vars(r)["name"]); err != nil {
		writeEngineError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *VolumeHandler) Prune(w http.ResponseWriter, r *http.Request) {
	removed, reclaimed := h.engine.PruneVolumes(r.Context())
	if removed == nil {
		removed = []string{}
	}
	writeJSON(w, http.StatusOK, volume.PruneReport{VolumesDeleted: removed, SpaceReclaimed: uint64(reclaimed)})
}
