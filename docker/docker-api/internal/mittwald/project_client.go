package mittwald

import (
	"context"
	"net/http"

	"github.com/mittwald/api-client-go/mittwaldv2/generated/clients/projectclientv2"
	"github.com/mittwald/api-client-go/mittwaldv2/generated/schemas/projectv2"
)

// ProjectClient defines the subset of projectclientv2.Client methods we use.
type ProjectClient interface {
	GetProject(ctx context.Context, req projectclientv2.GetProjectRequest, reqEditors ...func(req *http.Request) error) (*projectv2.Project, *http.Response, error)
}
