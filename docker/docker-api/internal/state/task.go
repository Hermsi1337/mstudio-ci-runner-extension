package state

import (
	"os"
	"path/filepath"
	"time"
)

// Task types the wrapper executes on behalf of the adapter.
const (
	TaskExec       = "exec"
	TaskStat       = "stat"
	TaskArchiveGet = "archive-get"
)

type TaskRequest struct {
	Type    string   `json:"type"`
	Process *Process `json:"process,omitempty"`
	Path    string   `json:"path,omitempty"`
}

type PathStat struct {
	Name       string      `json:"name"`
	Size       int64       `json:"size"`
	Mode       os.FileMode `json:"mode"`
	Mtime      time.Time   `json:"mtime"`
	LinkTarget string      `json:"linkTarget"`
}

type TaskResult struct {
	Code     int       `json:"code"`
	Error    string    `json:"error,omitempty"`
	NotFound bool      `json:"notFound,omitempty"`
	Stat     *PathStat `json:"stat,omitempty"`
	Pid      int       `json:"pid,omitempty"`
}

// Task is one directory below tasks/. The adapter writes request.json, the
// wrapper claims it by renaming it to claimed.json, streams into output and
// writes result.json last.
type Task string

func (t Task) RequestPath() string { return filepath.Join(string(t), "request.json") }
func (t Task) ClaimedPath() string { return filepath.Join(string(t), "claimed.json") }
func (t Task) OutputPath() string  { return filepath.Join(string(t), "output") }
func (t Task) ArchivePath() string { return filepath.Join(string(t), "archive.tar") }
func (t Task) ResultPath() string  { return filepath.Join(string(t), "result.json") }
func (t Task) StartedPath() string { return filepath.Join(string(t), "started.json") }

// ArchiveRequest is archives/<n>.json. It names the tar file next to it and
// the directory to extract it into. The wrapper answers with <n>.done or
// <n>.error, the latter holding the message.
type ArchiveRequest struct {
	Path string `json:"path"`
	Tar  string `json:"tar"`
}
