package mittwald

import (
	"fmt"
	"net/netip"
	"strconv"
	"strings"
	"time"

	"github.com/mittwald/api-client-go/mittwaldv2/generated/schemas/containerv2"
	"github.com/moby/moby/api/types/container"
	"github.com/moby/moby/api/types/mount"
	"github.com/moby/moby/api/types/network"
	"github.com/moby/moby/api/types/volume"
)

func ConvertEnvVars(dockerEnv []string) map[string]string {
	result := make(map[string]string)
	for _, env := range dockerEnv {
		parts := strings.SplitN(env, "=", 2)
		if len(parts) == 2 {
			result[parts[0]] = parts[1]
		} else if len(parts) == 1 {
			result[parts[0]] = ""
		}
	}
	return result
}

func ConvertEnvVarsToDocker(envs map[string]string) []string {
	result := make([]string, 0, len(envs))
	for k, v := range envs {
		result = append(result, k+"="+v)
	}
	return result
}

func ConvertPorts(exposed network.PortSet, bindings network.PortMap) []string {
	portSet := make(map[string]bool)

	for port := range exposed {
		if hostBindings, ok := bindings[port]; ok && len(hostBindings) > 0 {
			hostPort := hostBindings[0].HostPort
			if hostPort != "" {
				portSet[fmt.Sprintf("%s:%d/%s", hostPort, port.Num(), port.Proto())] = true
			} else {
				portSet[fmt.Sprintf("%d/%s", port.Num(), port.Proto())] = true
			}
		} else {
			portSet[fmt.Sprintf("%d/%s", port.Num(), port.Proto())] = true
		}
	}

	for port, hostBindings := range bindings {
		if len(hostBindings) > 0 {
			hostPort := hostBindings[0].HostPort
			if hostPort != "" {
				portSet[fmt.Sprintf("%s:%d/%s", hostPort, port.Num(), port.Proto())] = true
			} else {
				portSet[fmt.Sprintf("%d/%s", port.Num(), port.Proto())] = true
			}
		}
	}

	result := make([]string, 0, len(portSet))
	for p := range portSet {
		result = append(result, p)
	}
	return result
}

func ConvertPortsToDocker(ports []string) ([]container.PortSummary, network.PortMap) {
	dockerPorts := make([]container.PortSummary, 0, len(ports))
	bindings := make(network.PortMap)

	for _, portStr := range ports {
		parts := strings.Split(portStr, "/")
		if len(parts) != 2 {
			continue
		}

		proto := network.IPProtocol(parts[1])
		portParts := strings.Split(parts[0], ":")

		var containerPort, hostPort uint16
		if len(portParts) == 2 {
			hp, _ := strconv.ParseUint(portParts[0], 10, 16)
			cp, _ := strconv.ParseUint(portParts[1], 10, 16)
			hostPort = uint16(hp)
			containerPort = uint16(cp)
		} else {
			cp, _ := strconv.ParseUint(portParts[0], 10, 16)
			containerPort = uint16(cp)
		}

		dockerPorts = append(dockerPorts, container.PortSummary{
			PrivatePort: containerPort,
			PublicPort:  hostPort,
			Type:        string(proto),
		})

		port, ok := network.PortFrom(containerPort, proto)
		if ok && hostPort > 0 {
			bindings[port] = []network.PortBinding{{
				HostIP:   netip.MustParseAddr("0.0.0.0"),
				HostPort: strconv.FormatUint(uint64(hostPort), 10),
			}}
		}
	}

	return dockerPorts, bindings
}

func ConvertVolumes(mounts []mount.Mount) []string {
	result := make([]string, 0, len(mounts))
	for _, m := range mounts {
		volumeStr := fmt.Sprintf("%s:%s", m.Source, m.Target)
		if m.ReadOnly {
			volumeStr += ":ro"
		}
		result = append(result, volumeStr)
	}
	return result
}

func ConvertVolumesToDocker(volumes []string) []container.MountPoint {
	result := make([]container.MountPoint, 0, len(volumes))
	for _, v := range volumes {
		parts := strings.Split(v, ":")
		if len(parts) < 2 {
			continue
		}

		mp := container.MountPoint{
			Source:      parts[0],
			Destination: parts[1],
			RW:          true,
		}

		if strings.HasPrefix(parts[0], "/") {
			mp.Type = mount.TypeBind
		} else {
			mp.Type = mount.TypeVolume
			mp.Name = parts[0]
		}

		if len(parts) >= 3 && parts[2] == "ro" {
			mp.RW = false
		}

		result = append(result, mp)
	}
	return result
}

func MapServiceStatus(status containerv2.ServiceStatus) (container.ContainerState, bool) {
	switch status {
	case containerv2.ServiceStatusRunning:
		return container.StateRunning, true
	case containerv2.ServiceStatusStopped:
		return container.StateExited, false
	case containerv2.ServiceStatusCreating, containerv2.ServiceStatusStarting:
		return container.StateCreated, false
	case containerv2.ServiceStatusError:
		return container.StateDead, false
	default:
		return container.StateExited, false
	}
}

func ServiceToContainer(svc containerv2.ServiceResponse) container.Summary {
	state, running := MapServiceStatus(svc.Status)
	ports, _ := ConvertPortsToDocker(svc.DeployedState.Ports)

	statusStr := "Exited (0)"
	if running {
		statusStr = "Up " + formatUptime(time.Since(svc.StatusSetAt))
	} else if state == container.StateCreated {
		statusStr = "Created"
	} else if state == container.StateDead {
		statusStr = "Dead"
	}

	imageDigest := ""
	if svc.DeployedState.ImageDigest != nil {
		imageDigest = *svc.DeployedState.ImageDigest
	}

	summary := container.Summary{
		ID:      svc.Id,
		Names:   []string{"/" + svc.ServiceName},
		Image:   svc.DeployedState.Image,
		ImageID: imageDigest,
		Command: strings.Join(svc.DeployedState.Command, " "),
		Created: svc.StatusSetAt.Unix(),
		State:   state,
		Status:  statusStr,
		Ports:   ports,
		Labels:  make(map[string]string),
		Mounts:  ConvertVolumesToDocker(svc.DeployedState.Volumes),
		NetworkSettings: &container.NetworkSettingsSummary{
			Networks: map[string]*network.EndpointSettings{
				"bridge": {
					NetworkID: "bridge",
					IPAddress: netip.MustParseAddr("172.17.0.2"),
					Gateway:   netip.MustParseAddr("172.17.0.1"),
				},
			},
		},
	}
	summary.HostConfig.NetworkMode = "bridge"

	return summary
}

func ServiceToInspectResponse(svc containerv2.ServiceResponse) container.InspectResponse {
	state, running := MapServiceStatus(svc.Status)
	_, portBindings := ConvertPortsToDocker(svc.DeployedState.Ports)

	exposedPorts := make(network.PortSet)
	for port := range portBindings {
		exposedPorts[port] = struct{}{}
	}

	return container.InspectResponse{
		ID:      svc.Id,
		Created: svc.StatusSetAt.Format(time.RFC3339Nano),
		Path:    "",
		Args:    svc.DeployedState.Command,
		State: &container.State{
			Status:     state,
			Running:    running,
			Paused:     false,
			Restarting: false,
			OOMKilled:  false,
			Dead:       state == container.StateDead,
			Pid:        0,
			ExitCode:   0,
			Error:      "",
			StartedAt:  svc.StatusSetAt.Format(time.RFC3339Nano),
			FinishedAt: "",
		},
		Image:  svc.DeployedState.Image,
		Name:   "/" + svc.ServiceName,
		Driver: "overlay2",
		HostConfig: &container.HostConfig{
			NetworkMode:  "bridge",
			PortBindings: portBindings,
			RestartPolicy: container.RestartPolicy{
				Name: container.RestartPolicyDisabled,
			},
		},
		Config: &container.Config{
			Hostname:     svc.ServiceName,
			Image:        svc.DeployedState.Image,
			Env:          ConvertEnvVarsToDocker(svc.DeployedState.Envs),
			Cmd:          svc.DeployedState.Command,
			Entrypoint:   svc.DeployedState.Entrypoint,
			ExposedPorts: exposedPorts,
			Labels:       make(map[string]string),
		},
		NetworkSettings: &container.NetworkSettings{
			Ports: portBindings,
			Networks: map[string]*network.EndpointSettings{
				"bridge": {
					NetworkID:   "bridge",
					EndpointID:  svc.Id,
					Gateway:     netip.MustParseAddr("172.17.0.1"),
					IPAddress:   netip.MustParseAddr("172.17.0.2"),
					IPPrefixLen: 16,
				},
			},
		},
		Mounts: ConvertVolumesToDocker(svc.DeployedState.Volumes),
	}
}

func VolumeResponseToDocker(vol containerv2.VolumeResponse) volume.Volume {
	return volume.Volume{
		Name:       vol.Name,
		Driver:     "local",
		Mountpoint: "/var/lib/docker/volumes/" + vol.Name + "/_data",
		CreatedAt:  vol.StorageUsageInBytesSetAt.Format(time.RFC3339),
		Labels:     make(map[string]string),
		Scope:      "local",
		Options:    make(map[string]string),
		UsageData: &volume.UsageData{
			Size:     vol.StorageUsageInBytes,
			RefCount: int64(len(vol.LinkedServices)),
		},
	}
}

func formatUptime(d time.Duration) string {
	if d < time.Minute {
		return "Less than a minute"
	}
	if d < time.Hour {
		mins := int(d.Minutes())
		if mins == 1 {
			return "1 minute"
		}
		return fmt.Sprintf("%d minutes", mins)
	}
	if d < 24*time.Hour {
		hours := int(d.Hours())
		if hours == 1 {
			return "1 hour"
		}
		return fmt.Sprintf("%d hours", hours)
	}
	days := int(d.Hours() / 24)
	if days == 1 {
		return "1 day"
	}
	return fmt.Sprintf("%d days", days)
}
