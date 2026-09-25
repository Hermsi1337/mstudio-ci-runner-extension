FROM golang:1.25-alpine AS builder

WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download

COPY . .

RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /adapter ./cmd/adapter

FROM alpine:3.22

RUN apk --no-cache add ca-certificates

WORKDIR /

COPY --from=builder /adapter /adapter

ENV ADAPTER_PORT=2375
ENV ADAPTER_HOST=0.0.0.0

EXPOSE 2375

ENTRYPOINT ["/adapter"]
