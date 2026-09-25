package adapter

import (
	"strings"

	. "github.com/onsi/ginkgo/v2"
	. "github.com/onsi/gomega"
)

var _ = Describe("sanitizeVolumeName", func() {
	It("keeps allowed characters unchanged", func() {
		Expect(sanitizeVolumeName("my-volume_1.2")).To(Equal("my-volume_1.2"))
	})

	It("replaces disallowed characters with underscores", func() {
		Expect(sanitizeVolumeName("my/volume:tag")).To(Equal("my_volume_tag"))
	})

	It("falls back to 'volume' for an empty name", func() {
		Expect(sanitizeVolumeName("")).To(Equal("volume"))
	})

	It("truncates names longer than 255 characters", func() {
		long := strings.Repeat("a", 300)
		Expect(sanitizeVolumeName(long)).To(HaveLen(255))
	})
})
