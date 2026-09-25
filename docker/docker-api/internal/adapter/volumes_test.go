package adapter_test

import (
	"context"
	"errors"
	"net/http"

	"github.com/mittwald/api-client-go/mittwaldv2/generated/clients/containerclientv2"
	"github.com/mittwald/api-client-go/mittwaldv2/generated/schemas/containerv2"
	. "github.com/onsi/ginkgo/v2"
	. "github.com/onsi/gomega"

	"github.com/hermsi1337/mstudio-ci-runner-extension/docker/docker-api/internal/adapter"
	"github.com/hermsi1337/mstudio-ci-runner-extension/docker/docker-api/internal/mocks"
	"github.com/moby/moby/api/types/volume"
)

var _ = Describe("VolumeAdapter", func() {
	var (
		volumeAdapter *adapter.VolumeAdapter
		mockClient    *mocks.MockContainerClient
		ctx           context.Context
	)

	BeforeEach(func() {
		mockClient = mocks.NewMockContainerClient()
		volumeAdapter = adapter.NewVolumeAdapter(mockClient, "project-123", "stack-456")
		ctx = context.Background()
	})

	volumeList := func(vols ...containerv2.VolumeResponse) func(ctx context.Context, req containerclientv2.ListStackVolumesRequest) (*[]containerv2.VolumeResponse, *http.Response, error) {
		return func(ctx context.Context, req containerclientv2.ListStackVolumesRequest) (*[]containerv2.VolumeResponse, *http.Response, error) {
			list := append([]containerv2.VolumeResponse{}, vols...)
			return &list, &http.Response{StatusCode: 200}, nil
		}
	}

	Describe("List", func() {
		It("maps mittwald volumes to Docker volumes", func() {
			mockClient.ListStackVolumesFunc = volumeList(
				containerv2.VolumeResponse{Id: "vol-1", Name: "data"},
				containerv2.VolumeResponse{Id: "vol-2", Name: "cache"},
			)

			resp, err := volumeAdapter.List(ctx)
			Expect(err).NotTo(HaveOccurred())
			Expect(resp.Volumes).To(HaveLen(2))
			Expect(resp.Warnings).NotTo(BeNil())
		})

		It("returns an empty response when there are no volumes", func() {
			resp, err := volumeAdapter.List(ctx)
			Expect(err).NotTo(HaveOccurred())
			Expect(resp.Volumes).To(BeEmpty())
		})

		It("propagates errors", func() {
			mockClient.ListStackVolumesFunc = func(ctx context.Context, req containerclientv2.ListStackVolumesRequest) (*[]containerv2.VolumeResponse, *http.Response, error) {
				return nil, nil, errors.New("boom")
			}

			_, err := volumeAdapter.List(ctx)
			Expect(err).To(HaveOccurred())
		})
	})

	Describe("Inspect", func() {
		It("resolves the volume by name and returns it", func() {
			mockClient.ListStackVolumesFunc = volumeList(
				containerv2.VolumeResponse{Id: "vol-1", Name: "data"},
			)
			mockClient.GetVolumeFunc = func(ctx context.Context, req containerclientv2.GetVolumeRequest) (*containerv2.VolumeResponse, *http.Response, error) {
				Expect(req.VolumeID).To(Equal("vol-1"))
				return &containerv2.VolumeResponse{Id: "vol-1", Name: "data"}, &http.Response{StatusCode: 200}, nil
			}

			vol, err := volumeAdapter.Inspect(ctx, "data")
			Expect(err).NotTo(HaveOccurred())
			Expect(vol.Name).To(Equal("data"))
		})

		It("returns ErrVolumeNotFound for an unknown volume", func() {
			_, err := volumeAdapter.Inspect(ctx, "missing")
			Expect(err).To(MatchError(adapter.ErrVolumeNotFound))
		})
	})

	Describe("Create", func() {
		It("creates a volume via UpdateStack and returns it from the re-list", func() {
			var updateCalled bool
			mockClient.UpdateStackFunc = func(ctx context.Context, req containerclientv2.UpdateStackRequest) (*containerv2.StackResponse, *http.Response, error) {
				updateCalled = true
				Expect(req.StackID).To(Equal("stack-456"))
				Expect(req.Body.Volumes).To(HaveKey("data"))
				return &containerv2.StackResponse{}, &http.Response{StatusCode: 200}, nil
			}
			mockClient.ListStackVolumesFunc = volumeList(
				containerv2.VolumeResponse{Id: "vol-1", Name: "data"},
			)

			vol, err := volumeAdapter.Create(ctx, volume.CreateRequest{Name: "data"})
			Expect(err).NotTo(HaveOccurred())
			Expect(updateCalled).To(BeTrue())
			Expect(vol.Name).To(Equal("data"))
		})

		It("returns a synthetic volume when the re-list does not contain it", func() {
			vol, err := volumeAdapter.Create(ctx, volume.CreateRequest{Name: "data", Labels: map[string]string{"k": "v"}})
			Expect(err).NotTo(HaveOccurred())
			Expect(vol.Name).To(Equal("data"))
			Expect(vol.Driver).To(Equal("local"))
			Expect(vol.Labels).To(HaveKeyWithValue("k", "v"))
		})

		It("returns ErrVolumeAlreadyExists when the name is already cached", func() {
			mockClient.ListStackVolumesFunc = volumeList(
				containerv2.VolumeResponse{Id: "vol-1", Name: "data"},
			)
			// Populate the cache via List.
			_, err := volumeAdapter.List(ctx)
			Expect(err).NotTo(HaveOccurred())

			_, err = volumeAdapter.Create(ctx, volume.CreateRequest{Name: "data"})
			Expect(err).To(MatchError(adapter.ErrVolumeAlreadyExists))
		})

		It("sanitizes the volume name", func() {
			mockClient.UpdateStackFunc = func(ctx context.Context, req containerclientv2.UpdateStackRequest) (*containerv2.StackResponse, *http.Response, error) {
				Expect(req.Body.Volumes).To(HaveKey("my_volume"))
				return &containerv2.StackResponse{}, &http.Response{StatusCode: 200}, nil
			}

			vol, err := volumeAdapter.Create(ctx, volume.CreateRequest{Name: "my/volume"})
			Expect(err).NotTo(HaveOccurred())
			Expect(vol.Name).To(Equal("my_volume"))
		})
	})

	Describe("Remove", func() {
		It("resolves and deletes the volume", func() {
			mockClient.ListStackVolumesFunc = volumeList(
				containerv2.VolumeResponse{Id: "vol-1", Name: "data"},
			)
			var deleted string
			mockClient.DeleteVolumeFunc = func(ctx context.Context, req containerclientv2.DeleteVolumeRequest) (*http.Response, error) {
				deleted = req.VolumeID
				return &http.Response{StatusCode: 204}, nil
			}

			Expect(volumeAdapter.Remove(ctx, "data")).To(Succeed())
			Expect(deleted).To(Equal("vol-1"))
		})

		It("returns ErrVolumeNotFound for an unknown volume", func() {
			Expect(volumeAdapter.Remove(ctx, "missing")).To(MatchError(adapter.ErrVolumeNotFound))
		})
	})
})
