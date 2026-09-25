package handlers

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/gorilla/mux"
	"github.com/hermsi1337/mstudio-ci-runner-extension/docker/docker-api/internal/adapter"
	"github.com/moby/moby/api/types/volume"
)

type VolumeHandler struct {
	adapter *adapter.VolumeAdapter
}

func NewVolumeHandler(volumeAdapter *adapter.VolumeAdapter) *VolumeHandler {
	return &VolumeHandler{
		adapter: volumeAdapter,
	}
}

func (h *VolumeHandler) List(w http.ResponseWriter, r *http.Request) {
	volumes, err := h.adapter.List(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(volumes)
}

func (h *VolumeHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req volume.CreateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid JSON: "+err.Error())
		return
	}

	vol, err := h.adapter.Create(r.Context(), req)
	if err != nil {
		if errors.Is(err, adapter.ErrVolumeAlreadyExists) {
			writeError(w, http.StatusConflict, "volume already exists")
			return
		}
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(vol)
}

func (h *VolumeHandler) Inspect(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	name := vars["name"]

	vol, err := h.adapter.Inspect(r.Context(), name)
	if err != nil {
		if errors.Is(err, adapter.ErrVolumeNotFound) {
			writeError(w, http.StatusNotFound, "no such volume")
			return
		}
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(vol)
}

func (h *VolumeHandler) Remove(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	name := vars["name"]

	err := h.adapter.Remove(r.Context(), name)
	if err != nil {
		if errors.Is(err, adapter.ErrVolumeNotFound) {
			writeError(w, http.StatusNotFound, "no such volume")
			return
		}
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func (h *VolumeHandler) Prune(w http.ResponseWriter, r *http.Request) {
	response := volume.PruneReport{
		VolumesDeleted: []string{},
		SpaceReclaimed: 0,
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(response)
}
