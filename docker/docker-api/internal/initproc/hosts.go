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

func (in *Init) readEtcHosts() []byte {
	original, err := os.ReadFile(etcHosts)
	if err != nil {
		return nil
	}
	if i := bytes.Index(original, []byte(hostsMarker)); i >= 0 {
		original = original[:i]
	}
	return original
}

// applyHosts writes the entries the adapter published below the original
// content of /etc/hosts and confirms them in hosts.applied. It returns the
// entries it handled, or last when nothing changed. A read-only /etc/hosts,
// as containers of an unprivileged user have, still confirms the entries:
// retrying would not help.
func (in *Init) applyHosts(original, last []byte) []byte {
	entries, err := os.ReadFile(in.dir.HostsPath())
	if err != nil || bytes.Equal(entries, last) {
		return last
	}
	if original != nil {
		content := append(append(append([]byte{}, original...), hostsMarker...), entries...)
		_ = os.WriteFile(etcHosts, content, 0o644)
	}
	applied := in.dir.HostsAppliedPath()
	if os.WriteFile(applied+".tmp", entries, 0o644) == nil {
		_ = os.Rename(applied+".tmp", applied)
	}
	return entries
}

func (in *Init) syncHosts(ctx context.Context, original, last []byte) {
	for {
		select {
		case <-ctx.Done():
			return
		case <-time.After(time.Second):
		}
		last = in.applyHosts(original, last)
	}
}
