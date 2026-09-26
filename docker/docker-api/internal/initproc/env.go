package initproc

import (
	"bufio"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
)

// mergeEnv combines environments; later lists win, like `docker run -e` wins
// over the ENV of the image.
func mergeEnv(lists ...[]string) []string {
	index := map[string]int{}
	var merged []string
	for _, list := range lists {
		for _, kv := range list {
			key, _, _ := strings.Cut(kv, "=")
			if i, ok := index[key]; ok {
				merged[i] = kv
				continue
			}
			index[key] = len(merged)
			merged = append(merged, kv)
		}
	}
	return merged
}

func envValue(env []string, key string) string {
	for i := len(env) - 1; i >= 0; i-- {
		if k, v, ok := strings.Cut(env[i], "="); ok && k == key {
			return v
		}
	}
	return ""
}

// lookPath resolves name against the PATH of the process, not the one of
// the wrapper, which the container may have replaced.
func lookPath(name string, env []string) (string, error) {
	if strings.Contains(name, "/") {
		return name, nil
	}
	path := envValue(env, "PATH")
	if path == "" {
		path = "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
	}
	for _, dir := range filepath.SplitList(path) {
		candidate := filepath.Join(dir, name)
		if info, err := os.Stat(candidate); err == nil && !info.IsDir() && info.Mode()&0o111 != 0 {
			return candidate, nil
		}
	}
	return "", fmt.Errorf("exec: %q: executable file not found in $PATH", name)
}

// lookupUser accepts the forms of `docker run --user`: name, uid, name:group,
// uid:gid.
func lookupUser(spec string) (*syscall.Credential, error) {
	userPart, groupPart, hasGroup := strings.Cut(spec, ":")
	uid, gid, err := resolveUser(userPart)
	if err != nil {
		return nil, err
	}
	if hasGroup {
		if gid, err = resolveGroup(groupPart); err != nil {
			return nil, err
		}
	}
	return &syscall.Credential{Uid: uint32(uid), Gid: uint32(gid)}, nil
}

func resolveUser(name string) (int, int, error) {
	if uid, err := strconv.Atoi(name); err == nil {
		gid := uid
		_ = scanColonFile("/etc/passwd", func(fields []string) bool {
			if len(fields) > 3 && fields[2] == name {
				gid, _ = strconv.Atoi(fields[3])
				return true
			}
			return false
		})
		return uid, gid, nil
	}
	uid, gid := -1, -1
	_ = scanColonFile("/etc/passwd", func(fields []string) bool {
		if len(fields) > 3 && fields[0] == name {
			uid, _ = strconv.Atoi(fields[2])
			gid, _ = strconv.Atoi(fields[3])
			return true
		}
		return false
	})
	if uid < 0 {
		return 0, 0, fmt.Errorf("unable to find user %s: no matching entries in passwd file", name)
	}
	return uid, gid, nil
}

func resolveGroup(name string) (int, error) {
	if gid, err := strconv.Atoi(name); err == nil {
		return gid, nil
	}
	gid := -1
	_ = scanColonFile("/etc/group", func(fields []string) bool {
		if len(fields) > 2 && fields[0] == name {
			gid, _ = strconv.Atoi(fields[2])
			return true
		}
		return false
	})
	if gid < 0 {
		return 0, fmt.Errorf("unable to find group %s: no matching entries in group file", name)
	}
	return gid, nil
}

var errStop = errors.New("stop")

func scanColonFile(path string, match func([]string) bool) error {
	f, err := os.Open(path)
	if err != nil {
		return err
	}
	defer func() { _ = f.Close() }()
	s := bufio.NewScanner(f)
	for s.Scan() {
		if match(strings.Split(s.Text(), ":")) {
			return errStop
		}
	}
	return s.Err()
}
