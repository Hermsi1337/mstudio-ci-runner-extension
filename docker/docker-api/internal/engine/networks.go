package engine

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/hermsi1337/mstudio-ci-runner-extension/docker/docker-api/internal/state"
)

// Networks are bookkeeping only. Every service of a stack shares one network
// and reaches the others by service name, which is why a container takes its
// first alias as service name (see pickServiceName).

const bridgeID = "bridge"

var builtinNetworks = []state.Network{
	{ID: bridgeID, Name: "bridge", Driver: "bridge"},
	{ID: "host", Name: "host", Driver: "host"},
	{ID: "none", Name: "none", Driver: "null"},
}

func (e *Engine) networkPath(id string) string {
	return filepath.Join(e.cfg.StateDir, "networks", id+".json")
}

func (e *Engine) Networks() []state.Network {
	list := append([]state.Network{}, builtinNetworks...)
	entries, _ := os.ReadDir(filepath.Join(e.cfg.StateDir, "networks"))
	for _, entry := range entries {
		var n state.Network
		if state.ReadJSON(filepath.Join(e.cfg.StateDir, "networks", entry.Name()), &n) == nil {
			list = append(list, n)
		}
	}
	return list
}

func (e *Engine) network(ref string) (*state.Network, error) {
	if ref == "" || ref == "default" {
		ref = "bridge"
	}
	var byPrefix []state.Network
	for _, n := range e.Networks() {
		if n.ID == ref || n.Name == ref {
			return &n, nil
		}
		if strings.HasPrefix(n.ID, ref) {
			byPrefix = append(byPrefix, n)
		}
	}
	if len(byPrefix) == 1 {
		return &byPrefix[0], nil
	}
	return nil, fmt.Errorf("%w: network %s not found", ErrNotFound, ref)
}

func (e *Engine) Network(ref string) (*state.Network, error) { return e.network(ref) }

func (e *Engine) CreateNetwork(name, driver string, labels map[string]string) (*state.Network, error) {
	if _, err := e.network(name); err == nil {
		return nil, fmt.Errorf("%w: network with name %s already exists", ErrConflict, name)
	}
	if driver == "" {
		driver = "bridge"
	}
	n := state.Network{ID: newID(), Name: name, Created: time.Now().UTC(), Labels: labels, Driver: driver}
	if err := state.WriteJSON(e.networkPath(n.ID), n); err != nil {
		return nil, err
	}
	return &n, nil
}

func (e *Engine) RemoveNetwork(ref string) error {
	n, err := e.network(ref)
	if err != nil {
		return err
	}
	for _, b := range builtinNetworks {
		if b.ID == n.ID {
			return fmt.Errorf("%w: %s is a pre-defined network and cannot be removed", ErrConflict, n.Name)
		}
	}
	return os.Remove(e.networkPath(n.ID))
}

// Connect records the network and its aliases. The DNS name of a service is
// fixed once it runs, so aliases added later resolve only if they equal it.
func (e *Engine) Connect(ref, containerRef string, aliases []string) error {
	n, err := e.network(ref)
	if err != nil {
		return err
	}
	c, err := e.Resolve(containerRef)
	if err != nil {
		return err
	}
	if c.Networks == nil {
		c.Networks = map[string]state.Endpoint{}
	}
	c.Networks[n.Name] = state.Endpoint{NetworkID: n.ID, Aliases: aliases}
	// Testcontainers adds aliases after create. Before the service exists its
	// name can still follow the first alias.
	if c.ServiceID == "" && !c.NameGiven && len(aliases) > 0 {
		if err := e.pickServiceName(context.Background(), c, false, aliases); err != nil {
			return err
		}
	}
	if err := e.save(c); err != nil {
		return err
	}
	e.publishHosts()
	return nil
}

func (e *Engine) Disconnect(ref, containerRef string) error {
	n, err := e.network(ref)
	if err != nil {
		return err
	}
	c, err := e.Resolve(containerRef)
	if err != nil {
		return err
	}
	delete(c.Networks, n.Name)
	return e.save(c)
}

// NetworkContainers lists the containers attached to a network.
func (e *Engine) NetworkContainers(n *state.Network) []*state.Container {
	var list []*state.Container
	for _, c := range e.containers() {
		if _, ok := c.Networks[n.Name]; ok || (len(c.Networks) == 0 && n.ID == bridgeID) {
			list = append(list, c)
		}
	}
	return list
}
