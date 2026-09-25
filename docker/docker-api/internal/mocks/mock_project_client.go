package mocks

import (
	"context"
	"net/http"

	"github.com/mittwald/api-client-go/mittwaldv2/generated/clients/projectclientv2"
	"github.com/mittwald/api-client-go/mittwaldv2/generated/schemas/projectv2"
)

// MockProjectClient implements mittwald.ProjectClient for testing.
type MockProjectClient struct {
	GetProjectFunc func(ctx context.Context, req projectclientv2.GetProjectRequest) (*projectv2.Project, *http.Response, error)
}

func NewMockProjectClient() *MockProjectClient {
	return &MockProjectClient{}
}

func (m *MockProjectClient) GetProject(ctx context.Context, req projectclientv2.GetProjectRequest, _ ...func(req *http.Request) error) (*projectv2.Project, *http.Response, error) {
	if m.GetProjectFunc != nil {
		return m.GetProjectFunc(ctx, req)
	}
	return &projectv2.Project{}, &http.Response{StatusCode: 200}, nil
}
