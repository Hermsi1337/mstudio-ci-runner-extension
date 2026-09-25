package mittwald_test

import (
	"testing"
	"time"

	"github.com/mittwald/api-client-go/mittwaldv2/generated/schemas/containerv2"
	"github.com/moby/moby/api/types/container"
	"github.com/moby/moby/api/types/mount"
	"github.com/moby/moby/api/types/network"
	. "github.com/onsi/ginkgo/v2"
	. "github.com/onsi/gomega"

	"github.com/mittwald/mittwald-container-adapter/internal/mittwald"
)

func TestMapper(t *testing.T) {
	RegisterFailHandler(Fail)
	RunSpecs(t, "Mapper Suite")
}

var _ = Describe("Mapper", func() {
	Describe("ConvertEnvVars", func() {
		It("converts Docker env format to mittwald format", func() {
			dockerEnv := []string{"FOO=bar", "BAZ=qux"}
			result := mittwald.ConvertEnvVars(dockerEnv)
			Expect(result).To(HaveKeyWithValue("FOO", "bar"))
			Expect(result).To(HaveKeyWithValue("BAZ", "qux"))
		})

		It("handles empty values", func() {
			dockerEnv := []string{"EMPTY="}
			result := mittwald.ConvertEnvVars(dockerEnv)
			Expect(result).To(HaveKeyWithValue("EMPTY", ""))
		})

		It("handles values with equals signs", func() {
			dockerEnv := []string{"URL=http://example.com?foo=bar"}
			result := mittwald.ConvertEnvVars(dockerEnv)
			Expect(result).To(HaveKeyWithValue("URL", "http://example.com?foo=bar"))
		})

		It("handles keys without values", func() {
			dockerEnv := []string{"KEYONLY"}
			result := mittwald.ConvertEnvVars(dockerEnv)
			Expect(result).To(HaveKeyWithValue("KEYONLY", ""))
		})
	})

	Describe("ConvertEnvVarsToDocker", func() {
		It("converts mittwald env format to Docker format", func() {
			mittwaldEnv := map[string]string{"FOO": "bar", "BAZ": "qux"}
			result := mittwald.ConvertEnvVarsToDocker(mittwaldEnv)
			Expect(result).To(ContainElements("FOO=bar", "BAZ=qux"))
		})
	})

	Describe("ConvertPorts", func() {
		It("converts Docker port bindings to mittwald exposed ports", func() {
			port80, _ := network.PortFrom(80, "tcp")
			exposed := network.PortSet{
				port80: struct{}{},
			}
			bindings := network.PortMap{
				port80: []network.PortBinding{{HostPort: "8080"}},
			}
			result := mittwald.ConvertPorts(exposed, bindings)
			Expect(result).To(ContainElement("8080:80/tcp"))
		})

		It("handles ports without host bindings", func() {
			port3000, _ := network.PortFrom(3000, "tcp")
			exposed := network.PortSet{
				port3000: struct{}{},
			}
			bindings := network.PortMap{}
			result := mittwald.ConvertPorts(exposed, bindings)
			Expect(result).To(ContainElement("3000/tcp"))
		})
	})

	Describe("ConvertPortsToDocker", func() {
		It("converts mittwald port format to Docker format", func() {
			ports := []string{"8080:80/tcp", "3000/tcp"}
			dockerPorts, bindings := mittwald.ConvertPortsToDocker(ports)

			Expect(dockerPorts).To(HaveLen(2))
			port80, _ := network.PortFrom(80, "tcp")
			Expect(bindings).To(HaveKey(port80))
			Expect(bindings[port80][0].HostPort).To(Equal("8080"))
		})
	})

	Describe("ConvertVolumes", func() {
		It("converts Docker mounts to mittwald volume format", func() {
			mounts := []mount.Mount{
				{Source: "mydata", Target: "/data"},
				{Source: "/host/path", Target: "/container/path"},
			}
			result := mittwald.ConvertVolumes(mounts)
			Expect(result).To(ContainElements("mydata:/data", "/host/path:/container/path"))
		})

		It("handles read-only volumes", func() {
			mounts := []mount.Mount{
				{Source: "mydata", Target: "/data", ReadOnly: true},
			}
			result := mittwald.ConvertVolumes(mounts)
			Expect(result).To(ContainElement("mydata:/data:ro"))
		})
	})

	Describe("ConvertVolumesToDocker", func() {
		It("converts mittwald volume format to Docker format", func() {
			volumes := []string{"mydata:/data", "/host/path:/container/path"}
			result := mittwald.ConvertVolumesToDocker(volumes)

			Expect(result).To(HaveLen(2))
			Expect(result[0].Source).To(Equal("mydata"))
			Expect(result[0].Destination).To(Equal("/data"))
			Expect(result[0].Type).To(Equal(mount.TypeVolume))
		})

		It("identifies bind mounts by path prefix", func() {
			volumes := []string{"/host/path:/container/path"}
			result := mittwald.ConvertVolumesToDocker(volumes)

			Expect(result[0].Type).To(Equal(mount.TypeBind))
		})

		It("handles read-only flag", func() {
			volumes := []string{"mydata:/data:ro"}
			result := mittwald.ConvertVolumesToDocker(volumes)

			Expect(result[0].RW).To(BeFalse())
		})
	})

	Describe("MapServiceStatus", func() {
		It("maps running status correctly", func() {
			state, running := mittwald.MapServiceStatus(containerv2.ServiceStatusRunning)
			Expect(state).To(Equal(container.StateRunning))
			Expect(running).To(BeTrue())
		})

		It("maps stopped status to exited", func() {
			state, running := mittwald.MapServiceStatus(containerv2.ServiceStatusStopped)
			Expect(state).To(Equal(container.StateExited))
			Expect(running).To(BeFalse())
		})

		It("maps creating status to created", func() {
			state, running := mittwald.MapServiceStatus(containerv2.ServiceStatusCreating)
			Expect(state).To(Equal(container.StateCreated))
			Expect(running).To(BeFalse())
		})

		It("maps error status to dead", func() {
			state, running := mittwald.MapServiceStatus(containerv2.ServiceStatusError)
			Expect(state).To(Equal(container.StateDead))
			Expect(running).To(BeFalse())
		})
	})

	Describe("ServiceToContainer", func() {
		It("converts a mittwald service to a Docker container", func() {
			svc := containerv2.ServiceResponse{
				Id:          "service-123",
				ServiceName: "nginx",
				Status:      containerv2.ServiceStatusRunning,
				StatusSetAt: time.Now(),
				DeployedState: containerv2.ServiceState{
					Image:   "nginx:latest",
					Ports:   []string{"8080:80/tcp"},
					Command: []string{"nginx", "-g", "daemon off;"},
				},
				Description: "Web server",
			}

			containerSummary := mittwald.ServiceToContainer(svc)

			Expect(containerSummary.ID).To(Equal("service-123"))
			Expect(containerSummary.Names).To(ContainElement("/nginx"))
			Expect(containerSummary.Image).To(Equal("nginx:latest"))
			Expect(containerSummary.State).To(Equal(container.StateRunning))
			Expect(containerSummary.Command).To(Equal("nginx -g daemon off;"))
		})
	})

	Describe("VolumeResponseToDocker", func() {
		It("converts a mittwald volume to a Docker volume", func() {
			vol := containerv2.VolumeResponse{
				Id:                       "vol-123",
				Name:                     "mydata",
				StorageUsageInBytes:      1024,
				StorageUsageInBytesSetAt: time.Now(),
				LinkedServices:           []string{"svc-1", "svc-2"},
			}

			dockerVol := mittwald.VolumeResponseToDocker(vol)

			Expect(dockerVol.Name).To(Equal("mydata"))
			Expect(dockerVol.Driver).To(Equal("local"))
			Expect(dockerVol.UsageData.Size).To(Equal(int64(1024)))
			Expect(dockerVol.UsageData.RefCount).To(Equal(int64(2)))
		})
	})
})
