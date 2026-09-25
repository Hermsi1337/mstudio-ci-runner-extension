package handlers

import (
	"bufio"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net"
	"net/http"
	"strconv"
	"time"

	"github.com/gorilla/mux"
	"github.com/moby/moby/api/types/container"

	"github.com/hermsi1337/mstudio-ci-runner-extension/docker/docker-api/internal/engine"
)

type ContainerHandler struct {
	engine *engine.Engine
}

func NewContainerHandler(e *engine.Engine) *ContainerHandler {
	return &ContainerHandler{engine: e}
}

func (h *ContainerHandler) List(w http.ResponseWriter, r *http.Request) {
	query := r.URL.Query()
	all := isTrue(query.Get("all"))
	limit, _ := strconv.Atoi(query.Get("limit"))
	filters, err := engine.ParseFilters(query.Get("filters"))
	if err != nil {
		writeEngineError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, h.engine.List(r.Context(), all, limit, filters))
}

func (h *ContainerHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req container.CreateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid JSON: "+err.Error())
		return
	}
	name := r.URL.Query().Get("name")
	given := name != ""
	if !given {
		name = generateContainerName()
	}
	result, err := h.engine.Create(r.Context(), engine.CreateOptions{Name: name, NameGiven: given, Request: req})
	if err != nil {
		writeEngineError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, container.CreateResponse{ID: result.ID, Warnings: nonNilStrings(result.Warnings)})
}

func (h *ContainerHandler) Inspect(w http.ResponseWriter, r *http.Request) {
	info, err := h.engine.Inspect(r.Context(), mux.Vars(r)["id"])
	if err != nil {
		writeEngineError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, info)
}

func (h *ContainerHandler) Start(w http.ResponseWriter, r *http.Request) {
	if err := h.engine.Start(r.Context(), mux.Vars(r)["id"]); err != nil {
		writeEngineError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func timeoutParam(r *http.Request) *int {
	raw := r.URL.Query().Get("t")
	if raw == "" {
		raw = r.URL.Query().Get("timeout")
	}
	if n, err := strconv.Atoi(raw); err == nil {
		return &n
	}
	return nil
}

func (h *ContainerHandler) Stop(w http.ResponseWriter, r *http.Request) {
	if err := h.engine.Stop(r.Context(), mux.Vars(r)["id"], timeoutParam(r), r.URL.Query().Get("signal")); err != nil {
		writeEngineError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *ContainerHandler) Restart(w http.ResponseWriter, r *http.Request) {
	if err := h.engine.Restart(r.Context(), mux.Vars(r)["id"], timeoutParam(r), r.URL.Query().Get("signal")); err != nil {
		writeEngineError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *ContainerHandler) Kill(w http.ResponseWriter, r *http.Request) {
	if err := h.engine.Kill(r.Context(), mux.Vars(r)["id"], r.URL.Query().Get("signal")); err != nil {
		writeEngineError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *ContainerHandler) Remove(w http.ResponseWriter, r *http.Request) {
	if err := h.engine.Remove(r.Context(), mux.Vars(r)["id"], isTrue(r.URL.Query().Get("force"))); err != nil {
		writeEngineError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *ContainerHandler) Wait(w http.ResponseWriter, r *http.Request) {
	condition := container.WaitCondition(r.URL.Query().Get("condition"))
	id := mux.Vars(r)["id"]
	if _, err := h.engine.Resolve(id); err != nil {
		writeEngineError(w, err)
		return
	}
	// The status line goes out right away, like dockerd does: the docker CLI
	// waits for it before it starts the container.
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	if f, ok := w.(http.Flusher); ok {
		f.Flush()
	}
	result, err := h.engine.Wait(r.Context(), id, condition)
	resp := container.WaitResponse{}
	if err != nil {
		resp.Error = &container.WaitExitError{Message: err.Error()}
	} else {
		resp.StatusCode = int64(result.StatusCode)
		if result.Error != "" {
			resp.Error = &container.WaitExitError{Message: result.Error}
		}
	}
	_ = json.NewEncoder(w).Encode(resp)
}

func (h *ContainerHandler) Logs(w http.ResponseWriter, r *http.Request) {
	id := mux.Vars(r)["id"]
	query := r.URL.Query()
	opts := engine.LogOptions{
		Follow:     isTrue(query.Get("follow")),
		Stdout:     isTrue(query.Get("stdout")),
		Stderr:     isTrue(query.Get("stderr")),
		Timestamps: isTrue(query.Get("timestamps")),
		Since:      parseUnix(query.Get("since")),
		Until:      parseUnix(query.Get("until")),
		Tail:       -1,
	}
	if n, err := strconv.Atoi(query.Get("tail")); err == nil {
		opts.Tail = n
	}
	if _, err := h.engine.Resolve(id); err != nil {
		writeEngineError(w, err)
		return
	}
	raw := h.engine.Tty(id)
	if raw {
		w.Header().Set("Content-Type", "application/vnd.docker.raw-stream")
	} else {
		w.Header().Set("Content-Type", "application/vnd.docker.multiplexed-stream")
	}
	w.WriteHeader(http.StatusOK)
	flush := func() {}
	if f, ok := w.(http.Flusher); ok {
		flush = f.Flush
		flush()
	}
	if err := h.engine.Logs(r.Context(), id, opts, engine.Output{W: w, Flush: flush, Raw: raw}); err != nil {
		slog.Debug("log stream ended", "container", id, "error", err)
	}
}

// Attach serves POST /containers/{id}/attach. Only output is supported:
// the platform offers no way to write to the stdin of a process.
func (h *ContainerHandler) Attach(w http.ResponseWriter, r *http.Request) {
	id := mux.Vars(r)["id"]
	if _, err := h.engine.Resolve(id); err != nil {
		writeEngineError(w, err)
		return
	}
	raw := h.engine.Tty(id)
	conn, err := hijack(w, r, raw)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer func() { _ = conn.Close() }()
	if err := h.engine.Attach(r.Context(), id, isTrue(r.URL.Query().Get("logs")), engine.Output{W: conn, Raw: raw}); err != nil {
		slog.Debug("attach ended", "container", id, "error", err)
	}
}

// hijack takes over the connection and answers like dockerd: 101 when the
// client asked for an upgrade, otherwise a 200 whose body lasts until the
// connection closes. dockerode sends no Upgrade header when it keeps stdin
// open and waits for a regular response.
func hijack(w http.ResponseWriter, r *http.Request, raw bool) (net.Conn, error) {
	hj, ok := w.(http.Hijacker)
	if !ok {
		return nil, errors.New("connection does not support hijacking")
	}
	conn, buf, err := hj.Hijack()
	if err != nil {
		return nil, err
	}
	contentType := "application/vnd.docker.multiplexed-stream"
	if raw {
		contentType = "application/vnd.docker.raw-stream"
	}
	if r.Header.Get("Upgrade") != "" {
		_, _ = fmt.Fprintf(buf, "HTTP/1.1 101 UPGRADED\r\nContent-Type: %s\r\nConnection: Upgrade\r\nUpgrade: tcp\r\n\r\n", contentType)
	} else {
		_, _ = fmt.Fprintf(buf, "HTTP/1.1 200 OK\r\nContent-Type: %s\r\nConnection: close\r\n\r\n", contentType)
	}
	if err := buf.Flush(); err != nil {
		_ = conn.Close()
		return nil, err
	}
	return &hijackedConn{Conn: conn, reader: buf.Reader}, nil
}

type hijackedConn struct {
	net.Conn
	reader *bufio.Reader
}

func (c *hijackedConn) Read(p []byte) (int, error) { return c.reader.Read(p) }

func (h *ContainerHandler) Top(w http.ResponseWriter, r *http.Request) {
	if _, err := h.engine.Resolve(mux.Vars(r)["id"]); err != nil {
		writeEngineError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, container.TopResponse{
		Titles:    []string{"UID", "PID", "PPID", "C", "STIME", "TTY", "TIME", "CMD"},
		Processes: [][]string{},
	})
}

func (h *ContainerHandler) Stats(w http.ResponseWriter, r *http.Request) {
	id := mux.Vars(r)["id"]
	if _, err := h.engine.Resolve(id); err != nil {
		writeEngineError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"read":         time.Now().UTC().Format(time.RFC3339Nano),
		"preread":      "0001-01-01T00:00:00Z",
		"pids_stats":   map[string]any{"current": 0},
		"blkio_stats":  map[string]any{},
		"num_procs":    0,
		"cpu_stats":    map[string]any{"cpu_usage": map[string]any{"total_usage": 0}, "system_cpu_usage": 0},
		"precpu_stats": map[string]any{"cpu_usage": map[string]any{"total_usage": 0}, "system_cpu_usage": 0},
		"memory_stats": map[string]any{"usage": 0, "limit": 0},
		"id":           id,
	})
}

func (h *ContainerHandler) ArchiveHead(w http.ResponseWriter, r *http.Request) {
	stat, err := h.engine.StatPath(r.Context(), mux.Vars(r)["id"], r.URL.Query().Get("path"))
	if err != nil {
		writeEngineError(w, err)
		return
	}
	w.Header().Set("X-Docker-Container-Path-Stat", encodeStat(stat))
	w.WriteHeader(http.StatusOK)
}

func (h *ContainerHandler) ArchiveGet(w http.ResponseWriter, r *http.Request) {
	stat, body, err := h.engine.GetArchive(r.Context(), mux.Vars(r)["id"], r.URL.Query().Get("path"))
	if err != nil {
		writeEngineError(w, err)
		return
	}
	defer func() { _ = body.Close() }()
	w.Header().Set("X-Docker-Container-Path-Stat", encodeStat(stat))
	w.Header().Set("Content-Type", "application/x-tar")
	w.WriteHeader(http.StatusOK)
	_, _ = io.Copy(w, body)
}

func (h *ContainerHandler) ArchivePut(w http.ResponseWriter, r *http.Request) {
	if err := h.engine.PutArchive(r.Context(), mux.Vars(r)["id"], r.URL.Query().Get("path"), r.Body); err != nil {
		writeEngineError(w, err)
		return
	}
	w.WriteHeader(http.StatusOK)
}

func encodeStat(stat any) string {
	data, _ := json.Marshal(stat)
	return base64.StdEncoding.EncodeToString(data)
}

func generateContainerName() string {
	return getRandomName()
}

func parseUnix(raw string) time.Time {
	if raw == "" || raw == "0" {
		return time.Time{}
	}
	if f, err := strconv.ParseFloat(raw, 64); err == nil {
		sec := int64(f)
		return time.Unix(sec, int64((f-float64(sec))*1e9))
	}
	if t, err := time.Parse(time.RFC3339Nano, raw); err == nil {
		return t
	}
	return time.Time{}
}

func isTrue(v string) bool {
	return v == "1" || v == "true" || v == "True"
}

func nonNilStrings(s []string) []string {
	if s == nil {
		return []string{}
	}
	return s
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, statusCode int, message string) {
	writeJSON(w, statusCode, map[string]string{"message": message})
}

func writeEngineError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, engine.ErrNotModified):
		w.WriteHeader(http.StatusNotModified)
	case errors.Is(err, engine.ErrNotFound):
		writeError(w, http.StatusNotFound, err.Error())
	case errors.Is(err, engine.ErrConflict):
		writeError(w, http.StatusConflict, err.Error())
	case errors.Is(err, engine.ErrInvalid):
		writeError(w, http.StatusBadRequest, err.Error())
	case errors.Is(err, engine.ErrUnsupported):
		writeError(w, http.StatusNotImplemented, err.Error())
	default:
		writeError(w, http.StatusInternalServerError, err.Error())
	}
}
