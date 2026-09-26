package mittwald

import (
	"context"
	"net/http"

	"github.com/mittwald/api-client-go/mittwaldv2/generated/clients/containerclientv2"
	"github.com/mittwald/api-client-go/mittwaldv2/generated/schemas/containerv2"
)

// ContainerClient defines the subset of containerclientv2.Client methods we use.
// This interface is satisfied by containerclientv2.Client and can be mocked for testing.
type ContainerClient interface {
	ListServices(ctx context.Context, req containerclientv2.ListServicesRequest, reqEditors ...func(req *http.Request) error) (*[]containerv2.ServiceResponse, *http.Response, error)
	GetService(ctx context.Context, req containerclientv2.GetServiceRequest, reqEditors ...func(req *http.Request) error) (*containerv2.ServiceResponse, *http.Response, error)
	StartService(ctx context.Context, req containerclientv2.StartServiceRequest, reqEditors ...func(req *http.Request) error) (*http.Response, error)
	StopService(ctx context.Context, req containerclientv2.StopServiceRequest, reqEditors ...func(req *http.Request) error) (*http.Response, error)
	RestartService(ctx context.Context, req containerclientv2.RestartServiceRequest, reqEditors ...func(req *http.Request) error) (*http.Response, error)
	UpdateStack(ctx context.Context, req containerclientv2.UpdateStackRequest, reqEditors ...func(req *http.Request) error) (*containerv2.StackResponse, *http.Response, error)
	DeclareStack(ctx context.Context, req containerclientv2.DeclareStackRequest, reqEditors ...func(req *http.Request) error) (*containerv2.StackResponse, *http.Response, error)
	ListStackVolumes(ctx context.Context, req containerclientv2.ListStackVolumesRequest, reqEditors ...func(req *http.Request) error) (*[]containerv2.VolumeResponse, *http.Response, error)
	GetVolume(ctx context.Context, req containerclientv2.GetVolumeRequest, reqEditors ...func(req *http.Request) error) (*containerv2.VolumeResponse, *http.Response, error)
	DeleteVolume(ctx context.Context, req containerclientv2.DeleteVolumeRequest, reqEditors ...func(req *http.Request) error) (*http.Response, error)
	GetServiceLogs(ctx context.Context, req containerclientv2.GetServiceLogsRequest, reqEditors ...func(req *http.Request) error) (*http.Response, error)
	GetContainerImageConfig(ctx context.Context, req containerclientv2.GetContainerImageConfigRequest, reqEditors ...func(req *http.Request) error) (*containerv2.ContainerImageConfig, *http.Response, error)
}
