package handlers_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"

	. "github.com/onsi/ginkgo/v2"
	. "github.com/onsi/gomega"

	"github.com/mittwald/mittwald-container-adapter/internal/docker/handlers"
)

var _ = Describe("SystemHandler", func() {
	var handler *handlers.SystemHandler

	BeforeEach(func() {
		handler = handlers.NewSystemHandler("p-123", "s-456")
	})

	Describe("Ping", func() {
		It("returns 200 with the API-Version header and OK body for GET", func() {
			rec := httptest.NewRecorder()
			handler.Ping(rec, httptest.NewRequest(http.MethodGet, "/_ping", nil))

			Expect(rec.Code).To(Equal(http.StatusOK))
			Expect(rec.Header().Get("API-Version")).To(Equal("1.44"))
			Expect(rec.Body.String()).To(Equal("OK"))
		})

		It("omits the body for HEAD requests", func() {
			rec := httptest.NewRecorder()
			handler.Ping(rec, httptest.NewRequest(http.MethodHead, "/_ping", nil))

			Expect(rec.Code).To(Equal(http.StatusOK))
			Expect(rec.Body.String()).To(BeEmpty())
		})
	})

	Describe("Version", func() {
		It("returns version metadata as JSON", func() {
			rec := httptest.NewRecorder()
			handler.Version(rec, httptest.NewRequest(http.MethodGet, "/version", nil))

			Expect(rec.Code).To(Equal(http.StatusOK))
			var body map[string]interface{}
			Expect(json.Unmarshal(rec.Body.Bytes(), &body)).To(Succeed())
			Expect(body).To(HaveKeyWithValue("ApiVersion", "1.44"))
			Expect(body).To(HaveKey("Components"))
		})
	})

	Describe("Info", func() {
		It("includes the project and stack identifiers", func() {
			rec := httptest.NewRecorder()
			handler.Info(rec, httptest.NewRequest(http.MethodGet, "/info", nil))

			Expect(rec.Code).To(Equal(http.StatusOK))
			var body map[string]interface{}
			Expect(json.Unmarshal(rec.Body.Bytes(), &body)).To(Succeed())
			Expect(body).To(HaveKeyWithValue("ID", "p-123"))
			Expect(body).To(HaveKeyWithValue("Name", "mittwald-s-456"))
			Expect(body["Labels"]).To(ContainElement("mittwald.project.id=p-123"))
		})
	})
})
