FROM golang:1.26-alpine AS builder

WORKDIR /app

RUN apk --no-cache add ca-certificates tzdata

COPY go.mod go.sum ./
RUN go mod download

COPY . .

# Build the Go app
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -v -o dockercrafter-backend ./cmd/server

# Final stage
FROM scratch

WORKDIR /app

COPY --from=builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/
COPY --from=builder /usr/share/zoneinfo /usr/share/zoneinfo

COPY --from=builder /app/dockercrafter-backend .
COPY --from=builder /app/config.yaml .

# Port exposed by the application
EXPOSE 12581

CMD ["./dockercrafter-backend"]
