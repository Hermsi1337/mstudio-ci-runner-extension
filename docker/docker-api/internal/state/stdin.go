package state

import (
	"errors"
	"io"
	"os"
	"path/filepath"
	"time"
)

// Stdin travels as a file: the adapter appends what the client sends and
// marks the end with a second file, the wrapper feeds it to the process.

type StdinFiles struct {
	Data   string
	Closed string
}

func (d Dir) Stdin() StdinFiles {
	return StdinFiles{Data: d.path("stdin"), Closed: d.path("stdin.closed")}
}

func (t Task) Stdin() StdinFiles {
	return StdinFiles{Data: filepath.Join(string(t), "stdin"), Closed: filepath.Join(string(t), "stdin.closed")}
}

// Receive appends r to the stdin file until r ends, then marks the end.
func (s StdinFiles) Receive(r io.Reader) error {
	if err := os.MkdirAll(filepath.Dir(s.Data), 0o777); err != nil {
		return err
	}
	f, err := os.OpenFile(s.Data, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o666)
	if err != nil {
		return err
	}
	buf := make([]byte, 32*1024)
	for {
		n, rerr := r.Read(buf)
		if n > 0 {
			if _, err := f.Write(buf[:n]); err != nil {
				_ = f.Close()
				return err
			}
			_ = f.Sync()
		}
		if rerr != nil {
			break
		}
	}
	if err := f.Close(); err != nil {
		return err
	}
	return os.WriteFile(s.Closed, nil, 0o666)
}

// Feed copies the stdin file into w as it grows and closes w once the end is
// marked and everything is copied, or when the reader of w is gone.
func (s StdinFiles) Feed(w io.WriteCloser, done <-chan struct{}) {
	defer func() { _ = w.Close() }()
	var f *os.File
	defer func() {
		if f != nil {
			_ = f.Close()
		}
	}()
	buf := make([]byte, 32*1024)
	for {
		if f == nil {
			if opened, err := os.Open(s.Data); err == nil {
				f = opened
			}
		}
		progressed := false
		if f != nil {
			n, err := f.Read(buf)
			if n > 0 {
				progressed = true
				if _, werr := w.Write(buf[:n]); werr != nil {
					return
				}
			}
			if err != nil && !errors.Is(err, io.EOF) {
				return
			}
		}
		if progressed {
			continue
		}
		if _, err := os.Stat(s.Closed); err == nil {
			if f == nil {
				return
			}
			// The end was marked; one more read catches bytes written just before.
			if n, _ := f.Read(buf); n > 0 {
				if _, werr := w.Write(buf[:n]); werr != nil {
					return
				}
				continue
			}
			return
		}
		select {
		case <-done:
			return
		case <-time.After(50 * time.Millisecond):
		}
	}
}
