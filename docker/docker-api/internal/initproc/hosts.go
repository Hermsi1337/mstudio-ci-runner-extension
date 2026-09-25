package initproc

import (
	"bytes"
	"context"
	"net"
	"os"
	"time"
)

const (
	etcHosts    = "/etc/hosts"
	hostsMarker = "# mstudio-docker-adapter\n"
)

// localIPs lists the IPv4 addresses of the container, which the adapter uses
// to reach it without waiting for the DNS of the stack.
func localIPs() []string {
	addrs, err := net.InterfaceAddrs()
	if err != nil {
		return nil
	}
	var ips []string
	for _, a := range addrs {
		ipNet, ok := a.(*net.IPNet)
		if !ok || ipNet.IP.IsLoopback() || ipNet.IP.To4() == nil {
			continue
		}
		ips = append(ips, ipNet.IP.String())
	}
	return ips
}

// syncHosts appends the entries the adapter publishes to /etc/hosts. It
// keeps the original content and does nothing when the file is read-only,
// as it is for containers that run as an unprivileged user.
func (in *Init) syncHosts(ctx context.Context) {
	original, err := os.ReadFile(etcHosts)
	if err != nil {
		return
	}
	if i := bytes.Index(original, []byte(hostsMarker)); i >= 0 {
		original = original[:i]
	}
	var last []byte
	for {
		entries, err := os.ReadFile(in.dir.HostsPath())
		if err == nil && !bytes.Equal(entries, last) {
			content := append(append(append([]byte{}, original...), hostsMarker...), entries...)
			if os.WriteFile(etcHosts, content, 0o644) != nil {
				return
			}
			last = entries
		}
		select {
		case <-ctx.Done():
			return
		case <-time.After(time.Second):
		}
	}
}
