package handlers

import (
	"encoding/json"
	"net/http"

	"github.com/gorilla/mux"
	"github.com/moby/moby/api/types/network"

	"github.com/hermsi1337/mstudio-ci-runner-extension/docker/docker-api/internal/engine"
	"github.com/hermsi1337/mstudio-ci-runner-extension/docker/docker-api/internal/state"
)

type NetworkHandler struct {
	engine *engine.Engine
}

func NewNetworkHandler(e *engine.Engine) *NetworkHandler {
	return &NetworkHandler{engine: e}
}

func toNetwork(n state.Network) network.Network {
	labels := n.Labels
	if labels == nil {
		labels = map[string]string{}
	}
	return network.Network{
		Name:       n.Name,
		ID:         n.ID,
		Created:    n.Created,
		Scope:      "local",
		Driver:     n.Driver,
		EnableIPv4: true,
		Options:    map[string]string{},
		Labels:     labels,
	}
}

func (h *NetworkHandler) List(w http.ResponseWriter, r *http.Request) {
	filters, err := engine.ParseFilters(r.URL.Query().Get("filters"))
	if err != nil {
		writeEngineError(w, err)
		return
	}
	list := []network.Summary{}
	for _, n := range h.engine.Networks() {
		if names, ok := filters["name"]; ok && !contains(names, n.Name) {
			continue
		}
		if ids, ok := filters["id"]; ok && !contains(ids, n.ID) {
			continue
		}
		list = append(list, network.Summary{Network: toNetwork(n)})
	}
	writeJSON(w, http.StatusOK, list)
}

func contains(list []string, v string) bool {
	for _, x := range list {
		if x == v {
			return true
		}
	}
	return false
}

func (h *NetworkHandler) Inspect(w http.ResponseWriter, r *http.Request) {
	n, err := h.engine.Network(mux.Vars(r)["id"])
	if err != nil {
		writeEngineError(w, err)
		return
	}
	containers := map[string]network.EndpointResource{}
	for _, c := range h.engine.NetworkContainers(n) {
		containers[c.ID] = network.EndpointResource{Name: c.Name, EndpointID: c.ID}
	}
	writeJSON(w, http.StatusOK, network.Inspect{Network: toNetwork(*n), Containers: containers})
}

func (h *NetworkHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req network.CreateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid JSON: "+err.Error())
		return
	}
	n, err := h.engine.CreateNetwork(req.Name, req.Driver, req.Labels)
	if err != nil {
		writeEngineError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, network.CreateResponse{ID: n.ID})
}

func (h *NetworkHandler) Remove(w http.ResponseWriter, r *http.Request) {
	if err := h.engine.RemoveNetwork(mux.Vars(r)["id"]); err != nil {
		writeEngineError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *NetworkHandler) Connect(w http.ResponseWriter, r *http.Request) {
	var req network.ConnectRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid JSON: "+err.Error())
		return
	}
	var aliases []string
	if req.EndpointConfig != nil {
		aliases = req.EndpointConfig.Aliases
	}
	if err := h.engine.Connect(mux.Vars(r)["id"], req.Container, aliases); err != nil {
		writeEngineError(w, err)
		return
	}
	w.WriteHeader(http.StatusOK)
}

func (h *NetworkHandler) Disconnect(w http.ResponseWriter, r *http.Request) {
	var req network.DisconnectRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid JSON: "+err.Error())
		return
	}
	if err := h.engine.Disconnect(mux.Vars(r)["id"], req.Container); err != nil {
		writeEngineError(w, err)
		return
	}
	w.WriteHeader(http.StatusOK)
}

func (h *NetworkHandler) Prune(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, network.PruneReport{NetworksDeleted: []string{}})
}
