package handlers

import (
	"encoding/json"
	"log/slog"
	"net/http"

	"github.com/gorilla/mux"
	"github.com/moby/moby/api/types/container"

	"github.com/hermsi1337/mstudio-ci-runner-extension/docker/docker-api/internal/engine"
	"github.com/hermsi1337/mstudio-ci-runner-extension/docker/docker-api/internal/state"
)

type ExecHandler struct {
	engine *engine.Engine
}

func NewExecHandler(e *engine.Engine) *ExecHandler {
	return &ExecHandler{engine: e}
}

// CreateExec handles POST /containers/{id}/exec
func (h *ExecHandler) CreateExec(w http.ResponseWriter, r *http.Request) {
	var req container.ExecCreateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid JSON: "+err.Error())
		return
	}
	id, err := h.engine.CreateExec(mux.Vars(r)["id"], req)
	if err != nil {
		writeEngineError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, container.ExecCreateResponse{ID: id})
}

// StartExec handles POST /exec/{id}/start. Stdin is not forwarded: the
// wrapper runs the command with /dev/null as input.
func (h *ExecHandler) StartExec(w http.ResponseWriter, r *http.Request) {
	id := mux.Vars(r)["id"]
	var req container.ExecStartRequest
	if r.ContentLength != 0 {
		_ = json.NewDecoder(r.Body).Decode(&req)
	}
	if _, err := h.engine.InspectExec(id); err != nil {
		writeEngineError(w, err)
		return
	}
	if req.Detach {
		if err := h.engine.StartExec(r.Context(), id, true, engine.Output{}); err != nil {
			writeEngineError(w, err)
			return
		}
		w.WriteHeader(http.StatusOK)
		return
	}
	raw := req.Tty || h.engine.ExecTty(id)
	conn, err := hijack(w, r, raw)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer func() { _ = conn.Close() }()
	out := engine.Output{W: conn, Raw: raw}
	if err := h.engine.StartExec(r.Context(), id, false, out); err != nil {
		slog.Debug("exec ended with error", "exec", id, "error", err)
		payload := []byte(err.Error() + "\n")
		if raw {
			_, _ = conn.Write(payload)
		} else {
			_ = state.WriteDockerFrame(conn, state.Stderr, payload)
		}
	}
}

// InspectExec handles GET /exec/{id}/json
func (h *ExecHandler) InspectExec(w http.ResponseWriter, r *http.Request) {
	info, err := h.engine.InspectExec(mux.Vars(r)["id"])
	if err != nil {
		writeEngineError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, info)
}

// ResizeExec handles POST /exec/{id}/resize; there is no TTY to resize.
func (h *ExecHandler) ResizeExec(w http.ResponseWriter, r *http.Request) {
	w.WriteHeader(http.StatusOK)
}
