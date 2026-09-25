package handlers_test

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"

	"github.com/gorilla/mux"
	"github.com/mittwald/api-client-go/mittwaldv2/generated/clients/containerclientv2"
	"github.com/mittwald/api-client-go/mittwaldv2/generated/schemas/containerv2"
	. "github.com/onsi/ginkgo/v2"
	. "github.com/onsi/gomega"

	"github.com/hermsi1337/mstudio-ci-runner-extension/docker/docker-api/internal/adapter"
	"github.com/hermsi1337/mstudio-ci-runner-extension/docker/docker-api/internal/docker/handlers"
	"github.com/hermsi1337/mstudio-ci-runner-extension/docker/docker-api/internal/mocks"
	"github.com/moby/moby/api/types/volume"
)

var _ = Describe("VolumeHandler", func() {
	var (
		handler    *handlers.VolumeHandler
		mockClient *mocks.MockContainerClient
	)

	BeforeEach(func() {
		mockClient = mocks.NewMockContainerClient()
		handler = handlers.NewVolumeHandler(adapter.NewVolumeAdapter(mockClient, "p-123", "s-456"))
	})

	withOneVolume := func() {
		mockClient.ListStackVolumesFunc = func(ctx context.Context, req containerclientv2.ListStackVolumesRequest) (*[]containerv2.VolumeResponse, *http.Response, error) {
			return &[]containerv2.VolumeResponse{{Id: "vol-1", Name: "data"}}, &http.Response{StatusCode: 200}, nil
		}
	}

	Describe("List", func() {
		It("returns the volume list", func() {
			withOneVolume()
			rec := httptest.NewRecorder()
			handler.List(rec, httptest.NewRequest(http.MethodGet, "/volumes", nil))

			Expect(rec.Code).To(Equal(http.StatusOK))
			var resp volume.ListResponse
			Expect(json.Unmarshal(rec.Body.Bytes(), &resp)).To(Succeed())
			Expect(resp.Volumes).To(HaveLen(1))
		})
	})

	Describe("Create", func() {
		It("returns 201 with the created volume", func() {
			body, _ := json.Marshal(volume.CreateRequest{Name: "data"})
			rec := httptest.NewRecorder()
			handler.Create(rec, httptest.NewRequest(http.MethodPost, "/volumes/create", bytes.NewReader(body)))

			Expect(rec.Code).To(Equal(http.StatusCreated))
			var vol volume.Volume
			Expect(json.Unmarshal(rec.Body.Bytes(), &vol)).To(Succeed())
			Expect(vol.Name).To(Equal("data"))
		})

		It("returns 400 for invalid JSON", func() {
			rec := httptest.NewRecorder()
			handler.Create(rec, httptest.NewRequest(http.MethodPost, "/volumes/create", bytes.NewReader([]byte("{"))))
			Expect(rec.Code).To(Equal(http.StatusBadRequest))
		})

		It("returns 409 when the volume already exists", func() {
			withOneVolume()
			body, _ := json.Marshal(volume.CreateRequest{Name: "data"})

			// Prime the adapter's name cache via List, then create the same name.
			recList := httptest.NewRecorder()
			handler.List(recList, httptest.NewRequest(http.MethodGet, "/volumes", nil))

			rec := httptest.NewRecorder()
			handler.Create(rec, httptest.NewRequest(http.MethodPost, "/volumes/create", bytes.NewReader(body)))
			Expect(rec.Code).To(Equal(http.StatusConflict))
		})
	})

	Describe("Inspect", func() {
		It("returns the volume", func() {
			withOneVolume()
			mockClient.GetVolumeFunc = func(ctx context.Context, req containerclientv2.GetVolumeRequest) (*containerv2.VolumeResponse, *http.Response, error) {
				return &containerv2.VolumeResponse{Id: "vol-1", Name: "data"}, &http.Response{StatusCode: 200}, nil
			}
			req := mux.SetURLVars(httptest.NewRequest(http.MethodGet, "/volumes/data", nil), map[string]string{"name": "data"})
			rec := httptest.NewRecorder()
			handler.Inspect(rec, req)

			Expect(rec.Code).To(Equal(http.StatusOK))
		})

		It("returns 404 for an unknown volume", func() {
			req := mux.SetURLVars(httptest.NewRequest(http.MethodGet, "/volumes/missing", nil), map[string]string{"name": "missing"})
			rec := httptest.NewRecorder()
			handler.Inspect(rec, req)

			Expect(rec.Code).To(Equal(http.StatusNotFound))
		})
	})

	Describe("Remove", func() {
		It("returns 204 on success", func() {
			withOneVolume()
			req := mux.SetURLVars(httptest.NewRequest(http.MethodDelete, "/volumes/data", nil), map[string]string{"name": "data"})
			rec := httptest.NewRecorder()
			handler.Remove(rec, req)

			Expect(rec.Code).To(Equal(http.StatusNoContent))
		})

		It("returns 404 for an unknown volume", func() {
			req := mux.SetURLVars(httptest.NewRequest(http.MethodDelete, "/volumes/missing", nil), map[string]string{"name": "missing"})
			rec := httptest.NewRecorder()
			handler.Remove(rec, req)

			Expect(rec.Code).To(Equal(http.StatusNotFound))
		})
	})
})
