.PHONY: build run test test-unit test-coverage test-watch clean fmt lint docker-build docker-run

BINARY_NAME=mittwald-container-adapter
DOCKER_IMAGE=mittwald-container-adapter

build:
	go build -o bin/$(BINARY_NAME) ./cmd/adapter

run: build
	./bin/$(BINARY_NAME)

test:
	ginkgo -r -v ./...

test-unit:
	ginkgo -r -v --skip-package=integration ./...

test-coverage:
	ginkgo -r -v --cover --coverprofile=coverage.out ./...
	go tool cover -html=coverage.out -o coverage.html
	@echo "Coverage report generated: coverage.html"

test-watch:
	ginkgo watch -r ./...

clean:
	rm -rf bin/
	rm -f coverage.out coverage.html

fmt:
	go fmt ./...

lint:
	golangci-lint run ./...

docker-build:
	docker build -t $(DOCKER_IMAGE) .

docker-run:
	docker run --rm \
		-e MITTWALD_API_TOKEN \
		-e MITTWALD_PROJECT_ID \
		-e MITTWALD_STACK_ID \
		-p 2375:2375 \
		$(DOCKER_IMAGE)

generate-mocks:
	go install go.uber.org/mock/mockgen@latest
	mockgen -source=internal/mittwald/client.go -destination=internal/mocks/mock_client_generated.go -package=mocks

deps:
	go mod download
	go mod tidy

install-tools:
	go install github.com/onsi/ginkgo/v2/ginkgo@latest
	go install github.com/golangci/golangci-lint/cmd/golangci-lint@latest
	go install go.uber.org/mock/mockgen@latest
