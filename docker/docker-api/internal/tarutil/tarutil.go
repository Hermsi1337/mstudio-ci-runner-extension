// Package tarutil implements the archive semantics of the Docker API:
// extracting an upload into a directory and packing a path for download.
package tarutil

import (
	"archive/tar"
	"bufio"
	"compress/bzip2"
	"compress/gzip"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/hermsi1337/mstudio-ci-runner-extension/docker/docker-api/internal/state"
)

// Decompress detects gzip and bzip2 by their magic bytes, as dockerd does.
func Decompress(r io.Reader) (io.Reader, error) {
	br := bufio.NewReader(r)
	magic, err := br.Peek(3)
	if err != nil && !errors.Is(err, io.EOF) {
		return nil, err
	}
	switch {
	case len(magic) >= 2 && magic[0] == 0x1f && magic[1] == 0x8b:
		return gzip.NewReader(br)
	case len(magic) >= 3 && string(magic) == "BZh":
		return bzip2.NewReader(br), nil
	}
	return br, nil
}

// Extract unpacks r below dir. Entries that point outside dir are refused.
// Ownership is kept only when the process may change it.
func Extract(r io.Reader, dir string) error {
	info, err := os.Stat(dir)
	if err != nil {
		return err
	}
	if !info.IsDir() {
		return fmt.Errorf("%s is not a directory", dir)
	}
	stream, err := Decompress(r)
	if err != nil {
		return err
	}
	tr := tar.NewReader(stream)
	root := filepath.Clean(dir)
	canChown := os.Geteuid() == 0
	var dirTimes []func()
	for {
		h, err := tr.Next()
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			return err
		}
		target := filepath.Join(root, filepath.Clean("/"+h.Name))
		if target != root && !strings.HasPrefix(target, root+string(os.PathSeparator)) && root != "/" {
			return fmt.Errorf("archive entry %q leaves %s", h.Name, dir)
		}
		if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
			return err
		}
		mode := os.FileMode(h.Mode).Perm() | os.FileMode(h.Mode)&(os.ModeSetuid|os.ModeSetgid|os.ModeSticky)
		switch h.Typeflag {
		case tar.TypeDir:
			if err := os.MkdirAll(target, mode); err != nil {
				return err
			}
			_ = os.Chmod(target, mode)
			modTime := h.ModTime
			dirTimes = append(dirTimes, func() { _ = os.Chtimes(target, modTime, modTime) })
		case tar.TypeReg, tar.TypeRegA:
			_ = os.Remove(target)
			f, err := os.OpenFile(target, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, mode)
			if err != nil {
				return err
			}
			if _, err := io.Copy(f, tr); err != nil {
				_ = f.Close()
				return err
			}
			if err := f.Close(); err != nil {
				return err
			}
			_ = os.Chmod(target, mode)
			_ = os.Chtimes(target, h.ModTime, h.ModTime)
		case tar.TypeSymlink:
			_ = os.Remove(target)
			if err := os.Symlink(h.Linkname, target); err != nil {
				return err
			}
		case tar.TypeLink:
			source := filepath.Join(root, filepath.Clean("/"+h.Linkname))
			_ = os.Remove(target)
			if err := os.Link(source, target); err != nil {
				return err
			}
		default:
			continue
		}
		if canChown {
			_ = os.Lchown(target, h.Uid, h.Gid)
		}
	}
	for i := len(dirTimes) - 1; i >= 0; i-- {
		dirTimes[i]()
	}
	return nil
}

// Stat describes path the way the X-Docker-Container-Path-Stat header does.
func Stat(path string) (*state.PathStat, error) {
	info, err := os.Lstat(path)
	if err != nil {
		return nil, err
	}
	stat := &state.PathStat{
		Name:  filepath.Base(path),
		Size:  info.Size(),
		Mode:  info.Mode(),
		Mtime: info.ModTime(),
	}
	if info.Mode()&os.ModeSymlink != 0 {
		stat.LinkTarget, _ = os.Readlink(path)
	}
	return stat, nil
}

// Pack writes path into w. The archive holds the base name of path and, for a
// directory, everything below it, like `docker cp` produces.
func Pack(path string, w io.Writer) error {
	tw := tar.NewWriter(w)
	base := filepath.Dir(filepath.Clean(path))
	err := filepath.Walk(path, func(file string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		link := ""
		if info.Mode()&os.ModeSymlink != 0 {
			link, _ = os.Readlink(file)
		}
		h, err := tar.FileInfoHeader(info, link)
		if err != nil {
			return err
		}
		rel, err := filepath.Rel(base, file)
		if err != nil {
			return err
		}
		h.Name = filepath.ToSlash(rel)
		if info.IsDir() {
			h.Name += "/"
		}
		h.ModTime = info.ModTime().Truncate(time.Second)
		if err := tw.WriteHeader(h); err != nil {
			return err
		}
		if !info.Mode().IsRegular() {
			return nil
		}
		f, err := os.Open(file)
		if err != nil {
			return err
		}
		defer func() { _ = f.Close() }()
		_, err = io.Copy(tw, f)
		return err
	})
	if err != nil {
		return err
	}
	return tw.Close()
}
