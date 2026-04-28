FROM golang:1.22-alpine AS builder

WORKDIR /build
COPY go.mod go.sum* ./
COPY cmd cmd/

RUN go build -o scropids-agent ./cmd/agent

FROM alpine:latest

RUN apk add --no-cache ca-certificates curl

WORKDIR /app
COPY --from=builder /build/scropids-agent .
COPY entrypoint.sh .

RUN chmod +x /app/entrypoint.sh

ENTRYPOINT ["/app/entrypoint.sh"]
