FROM golang:1.25-alpine AS build

ARG VERSION=dev

WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY cmd ./cmd
COPY internal ./internal
# Static, because the same binary runs as mstudio-init inside images of any libc.
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w -X main.version=${VERSION}" -o /adapter ./cmd/adapter

FROM alpine:3.22

RUN apk add --no-cache ca-certificates
COPY --from=build /adapter /adapter

ENV ADAPTER_PORT=2375 \
    ADAPTER_HOST=0.0.0.0
EXPOSE 2375

ENTRYPOINT ["/adapter"]
