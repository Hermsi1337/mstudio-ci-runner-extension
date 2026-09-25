package state

import (
	"bufio"
	"encoding/binary"
	"errors"
	"io"
	"os"
	"sync"
	"time"
)

const (
	Stdout byte = 1
	Stderr byte = 2
)

// Frame is one line of output. On disk: stream (1 byte), unix nanos (8 bytes),
// length (4 bytes), payload. The Docker stream format lacks the timestamp that
// `docker logs --timestamps` and `--since` need, so it is added here and
// dropped again when the adapter answers.
type Frame struct {
	Stream  byte
	Time    time.Time
	Payload []byte
}

const frameHeader = 13

type FrameWriter struct {
	mu sync.Mutex
	w  io.Writer
}

func NewFrameWriter(w io.Writer) *FrameWriter {
	return &FrameWriter{w: w}
}

func (fw *FrameWriter) Write(stream byte, payload []byte) error {
	var header [frameHeader]byte
	header[0] = stream
	binary.BigEndian.PutUint64(header[1:9], uint64(time.Now().UnixNano()))
	binary.BigEndian.PutUint32(header[9:13], uint32(len(payload)))
	fw.mu.Lock()
	defer fw.mu.Unlock()
	if _, err := fw.w.Write(append(header[:], payload...)); err != nil {
		return err
	}
	if f, ok := fw.w.(*os.File); ok {
		return f.Sync()
	}
	return nil
}

// Pump copies r into the frame writer line by line until r ends.
func (fw *FrameWriter) Pump(stream byte, r io.Reader, mirror io.Writer) {
	br := bufio.NewReaderSize(r, 64*1024)
	for {
		line, err := br.ReadSlice('\n')
		if len(line) > 0 {
			chunk := append([]byte(nil), line...)
			_ = fw.Write(stream, chunk)
			if mirror != nil {
				_, _ = mirror.Write(chunk)
			}
		}
		if err != nil && !errors.Is(err, bufio.ErrBufferFull) {
			return
		}
	}
}

// FrameReader reads frames from a file that may still grow.
type FrameReader struct {
	f      *os.File
	offset int64
}

func OpenFrames(path string) (*FrameReader, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	return &FrameReader{f: f}, nil
}

func (r *FrameReader) Close() error { return r.f.Close() }

func (r *FrameReader) Offset() int64 { return r.offset }

// SeekEnd skips everything written so far.
func (r *FrameReader) SeekEnd() {
	if info, err := r.f.Stat(); err == nil {
		r.offset = info.Size()
	}
}

// Next returns the next complete frame, or io.EOF when none is complete yet.
func (r *FrameReader) Next() (*Frame, error) {
	var header [frameHeader]byte
	n, err := r.f.ReadAt(header[:], r.offset)
	if n < frameHeader {
		if err == nil || errors.Is(err, io.EOF) {
			return nil, io.EOF
		}
		return nil, err
	}
	size := binary.BigEndian.Uint32(header[9:13])
	payload := make([]byte, size)
	n, err = r.f.ReadAt(payload, r.offset+frameHeader)
	if uint32(n) < size {
		if err == nil || errors.Is(err, io.EOF) {
			return nil, io.EOF
		}
		return nil, err
	}
	r.offset += frameHeader + int64(size)
	return &Frame{
		Stream:  header[0],
		Time:    time.Unix(0, int64(binary.BigEndian.Uint64(header[1:9]))),
		Payload: payload,
	}, nil
}

// ReadAll returns every complete frame in the file.
func ReadAllFrames(path string) ([]Frame, error) {
	r, err := OpenFrames(path)
	if err != nil {
		return nil, err
	}
	defer func() { _ = r.Close() }()
	var frames []Frame
	for {
		f, err := r.Next()
		if errors.Is(err, io.EOF) {
			return frames, nil
		}
		if err != nil {
			return frames, err
		}
		frames = append(frames, *f)
	}
}

// WriteDockerFrame writes payload in the multiplexed format of the Docker API.
func WriteDockerFrame(w io.Writer, stream byte, payload []byte) error {
	var header [8]byte
	header[0] = stream
	binary.BigEndian.PutUint32(header[4:], uint32(len(payload)))
	if _, err := w.Write(header[:]); err != nil {
		return err
	}
	_, err := w.Write(payload)
	return err
}
