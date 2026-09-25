package engine

import (
	"fmt"
	"os"
	"sort"
	"strings"

	"github.com/hermsi1337/mstudio-ci-runner-extension/docker/docker-api/internal/state"
)

// containerIP is the address the wrapper reported for the current run. The
// DNS of the stack resolves a new service only after a while and caches the
// miss, so the adapter prefers the address.
func (e *Engine) containerIP(c *state.Container) string {
	st := e.dir(c.ID).Status()
	if !st.Running() || len(st.Run.IPs) == 0 {
		return ""
	}
	return st.Run.IPs[0]
}

func (e *Engine) target(c *state.Container) func() string {
	id, service := c.ID, c.ServiceName
	return func() string {
		if current, err := e.dir(id).Container(); err == nil {
			if ip := e.containerIP(current); ip != "" {
				return ip
			}
		}
		return service
	}
}

// publishHosts writes the names of all running containers into every
// container directory, where the wrapper merges them into /etc/hosts. That is
// what the embedded DNS of dockerd does for names and network aliases.
func (e *Engine) publishHosts() {
	containers := e.containers()
	var lines []string
	for _, c := range containers {
		if c.Virtual != "" {
			continue
		}
		ip := e.containerIP(c)
		if ip == "" {
			continue
		}
		names := map[string]bool{c.ServiceName: true}
		if n := hostName(c.Name); n != "" {
			names[n] = true
		}
		for _, ep := range c.Networks {
			for _, alias := range ep.Aliases {
				if n := hostName(alias); n != "" {
					names[n] = true
				}
			}
		}
		sorted := make([]string, 0, len(names))
		for n := range names {
			sorted = append(sorted, n)
		}
		sort.Strings(sorted)
		lines = append(lines, fmt.Sprintf("%s\t%s", ip, strings.Join(sorted, " ")))
	}
	sort.Strings(lines)
	content := []byte(strings.Join(lines, "\n") + "\n")
	for _, c := range containers {
		if c.Virtual != "" {
			continue
		}
		path := e.dir(c.ID).HostsPath()
		if current, err := os.ReadFile(path); err == nil && string(current) == string(content) {
			continue
		}
		tmp := path + ".tmp"
		if os.WriteFile(tmp, content, 0o644) == nil {
			_ = os.Rename(tmp, path)
		}
	}
}

// hostName keeps names that are valid in /etc/hosts.
func hostName(name string) string {
	name = strings.TrimPrefix(name, "/")
	if name == "" || len(name) > 253 {
		return ""
	}
	for _, r := range name {
		if !(r >= 'a' && r <= 'z' || r >= 'A' && r <= 'Z' || r >= '0' && r <= '9' || r == '-' || r == '.' || r == '_') {
			return ""
		}
	}
	return name
}
