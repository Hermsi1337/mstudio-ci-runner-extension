package handlers

import (
	"strings"

	. "github.com/onsi/ginkgo/v2"
	. "github.com/onsi/gomega"
)

var _ = Describe("name generator", func() {
	Describe("getRandomName", func() {
		It("produces a non-empty adjective_noun name", func() {
			name := getRandomName()
			Expect(name).NotTo(BeEmpty())
			Expect(name).To(MatchRegexp(`^[a-z]+_[a-z]+$`))
		})

		It("draws both parts from the configured word lists", func() {
			parts := strings.SplitN(getRandomName(), "_", 2)
			Expect(parts).To(HaveLen(2))
			Expect(left).To(ContainElement(parts[0]))
			Expect(right).To(ContainElement(parts[1]))
		})
	})

	Describe("generateContainerName", func() {
		It("delegates to the random name generator", func() {
			Expect(generateContainerName()).To(MatchRegexp(`^[a-z]+_[a-z]+$`))
		})
	})
})
