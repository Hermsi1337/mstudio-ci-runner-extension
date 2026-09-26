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
// content of /etc/hosts. It returns the entries it wrote, or last when
// nothing changed or /etc/hosts is read-only, as it is for containers that
// run as an unprivileged user.
func (in *Init) applyHosts(original, last []byte) []byte {
	if original == nil {
		return last
	}
	entries, err := os.ReadFile(in.dir.HostsPath())
	if err != nil || bytes.Equal(entries, last) {
		return last
	}
	content := append(append(append([]byte{}, original...), hostsMarker...), entries...)
	if os.WriteFile(etcHosts, content, 0o644) != nil {
		return last
	}
	return entries
}

func (in *Init) syncHosts(ctx context.Context, original []byte) {
	var last []byte
	for {
		last = in.applyHosts(original, last)
		select {
		case <-ctx.Done():
			return
		case <-time.After(time.Second):
		}
	}
}
