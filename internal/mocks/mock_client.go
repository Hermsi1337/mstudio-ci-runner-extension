package mocks

import (
	"context"
	"net/http"

	"github.com/mittwald/api-client-go/mittwaldv2/generated/clients/containerclientv2"
	"github.com/mittwald/api-client-go/mittwaldv2/generated/schemas/containerv2"
)

// MockContainerClient implements mittwald.ContainerClient for testing.
type MockContainerClient struct {
	ListServicesFunc     func(ctx context.Context, req containerclientv2.ListServicesRequest) (*[]containerv2.ServiceResponse, *http.Response, error)
	GetServiceFunc       func(ctx context.Context, req containerclientv2.GetServiceRequest) (*containerv2.ServiceResponse, *http.Response, error)
	StartServiceFunc     func(ctx context.Context, req containerclientv2.StartServiceRequest) (*http.Response, error)
	StopServiceFunc      func(ctx context.Context, req containerclientv2.StopServiceRequest) (*http.Response, error)
	RestartServiceFunc   func(ctx context.Context, req containerclientv2.RestartServiceRequest) (*http.Response, error)
	UpdateStackFunc      func(ctx context.Context, req containerclientv2.UpdateStackRequest) (*containerv2.StackResponse, *http.Response, error)
	DeclareStackFunc     func(ctx context.Context, req containerclientv2.DeclareStackRequest) (*containerv2.StackResponse, *http.Response, error)
	ListStackVolumesFunc func(ctx context.Context, req containerclientv2.ListStackVolumesRequest) (*[]containerv2.VolumeResponse, *http.Response, error)
	GetVolumeFunc        func(ctx context.Context, req containerclientv2.GetVolumeRequest) (*containerv2.VolumeResponse, *http.Response, error)
	DeleteVolumeFunc     func(ctx context.Context, req containerclientv2.DeleteVolumeRequest) (*http.Response, error)
	GetServiceLogsFunc   func(ctx context.Context, req containerclientv2.GetServiceLogsRequest) (*http.Response, error)
	GetImageConfigFunc   func(ctx context.Context, req containerclientv2.GetContainerImageConfigRequest) (*containerv2.ContainerImageConfig, *http.Response, error)
}

func NewMockContainerClient() *MockContainerClient {
	return &MockContainerClient{}
}

func (m *MockContainerClient) ListServices(ctx context.Context, req containerclientv2.ListServicesRequest, _ ...func(req *http.Request) error) (*[]containerv2.ServiceResponse, *http.Response, error) {
	if m.ListServicesFunc != nil {
		return m.ListServicesFunc(ctx, req)
	}
	return &[]containerv2.ServiceResponse{}, &http.Response{StatusCode: 200}, nil
}

func (m *MockContainerClient) GetService(ctx context.Context, req containerclientv2.GetServiceRequest, _ ...func(req *http.Request) error) (*containerv2.ServiceResponse, *http.Response, error) {
	if m.GetServiceFunc != nil {
		return m.GetServiceFunc(ctx, req)
	}
	return nil, &http.Response{StatusCode: 404}, nil
}

func (m *MockContainerClient) StartService(ctx context.Context, req containerclientv2.StartServiceRequest, _ ...func(req *http.Request) error) (*http.Response, error) {
	if m.StartServiceFunc != nil {
		return m.StartServiceFunc(ctx, req)
	}
	return &http.Response{StatusCode: 204}, nil
}

func (m *MockContainerClient) StopService(ctx context.Context, req containerclientv2.StopServiceRequest, _ ...func(req *http.Request) error) (*http.Response, error) {
	if m.StopServiceFunc != nil {
		return m.StopServiceFunc(ctx, req)
	}
	return &http.Response{StatusCode: 204}, nil
}

func (m *MockContainerClient) RestartService(ctx context.Context, req containerclientv2.RestartServiceRequest, _ ...func(req *http.Request) error) (*http.Response, error) {
	if m.RestartServiceFunc != nil {
		return m.RestartServiceFunc(ctx, req)
	}
	return &http.Response{StatusCode: 204}, nil
}

func (m *MockContainerClient) UpdateStack(ctx context.Context, req containerclientv2.UpdateStackRequest, _ ...func(req *http.Request) error) (*containerv2.StackResponse, *http.Response, error) {
	if m.UpdateStackFunc != nil {
		return m.UpdateStackFunc(ctx, req)
	}
	return &containerv2.StackResponse{}, &http.Response{StatusCode: 200}, nil
}

func (m *MockContainerClient) DeclareStack(ctx context.Context, req containerclientv2.DeclareStackRequest, _ ...func(req *http.Request) error) (*containerv2.StackResponse, *http.Response, error) {
	if m.DeclareStackFunc != nil {
		return m.DeclareStackFunc(ctx, req)
	}
	return &containerv2.StackResponse{}, &http.Response{StatusCode: 200}, nil
}

func (m *MockContainerClient) ListStackVolumes(ctx context.Context, req containerclientv2.ListStackVolumesRequest, _ ...func(req *http.Request) error) (*[]containerv2.VolumeResponse, *http.Response, error) {
	if m.ListStackVolumesFunc != nil {
		return m.ListStackVolumesFunc(ctx, req)
	}
	return &[]containerv2.VolumeResponse{}, &http.Response{StatusCode: 200}, nil
}

func (m *MockContainerClient) GetVolume(ctx context.Context, req containerclientv2.GetVolumeRequest, _ ...func(req *http.Request) error) (*containerv2.VolumeResponse, *http.Response, error) {
	if m.GetVolumeFunc != nil {
		return m.GetVolumeFunc(ctx, req)
	}
	return nil, &http.Response{StatusCode: 404}, nil
}

func (m *MockContainerClient) DeleteVolume(ctx context.Context, req containerclientv2.DeleteVolumeRequest, _ ...func(req *http.Request) error) (*http.Response, error) {
	if m.DeleteVolumeFunc != nil {
		return m.DeleteVolumeFunc(ctx, req)
	}
	return &http.Response{StatusCode: 204}, nil
}

func (m *MockContainerClient) GetServiceLogs(ctx context.Context, req containerclientv2.GetServiceLogsRequest, _ ...func(req *http.Request) error) (*http.Response, error) {
	if m.GetServiceLogsFunc != nil {
		return m.GetServiceLogsFunc(ctx, req)
	}
	return &http.Response{StatusCode: 200}, nil
}

func (m *MockContainerClient) GetContainerImageConfig(ctx context.Context, req containerclientv2.GetContainerImageConfigRequest, _ ...func(req *http.Request) error) (*containerv2.ContainerImageConfig, *http.Response, error) {
	if m.GetImageConfigFunc != nil {
		return m.GetImageConfigFunc(ctx, req)
	}
	return &containerv2.ContainerImageConfig{}, &http.Response{StatusCode: 200}, nil
}
