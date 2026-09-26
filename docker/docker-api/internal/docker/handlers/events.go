package handlers

import (
	"encoding/json"
	"net/http"

	"github.com/moby/moby/api/types/events"

	"github.com/hermsi1337/mstudio-ci-runner-extension/docker/docker-api/internal/engine"
)

type EventHandler struct {
	engine *engine.Engine
}

func NewEventHandler(e *engine.Engine) *EventHandler {
	return &EventHandler{engine: e}
}

// Stream serves GET /events: one JSON object per event, flushed at once.
func (h *EventHandler) Stream(w http.ResponseWriter, r *http.Request) {
	query := r.URL.Query()
	filters, err := engine.ParseFilters(query.Get("filters"))
	if err != nil {
		writeEngineError(w, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	flusher, _ := w.(http.Flusher)
	if flusher != nil {
		flusher.Flush()
	}
	encoder := json.NewEncoder(w)
	_ = h.engine.Events(r.Context(), parseUnix(query.Get("since")), parseUnix(query.Get("until")), filters, func(m events.Message) error {
		if err := encoder.Encode(m); err != nil {
			return err
		}
		if flusher != nil {
			flusher.Flush()
		}
		return nil
	})
}
