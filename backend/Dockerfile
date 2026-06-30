FROM golang:1.26-alpine AS builder

WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download

COPY . .

# Build the Go app
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -v -o dockercrafter-backend ./cmd/server

# Final stage
FROM alpine:latest

WORKDIR /app

# Add tzdata for timezone support if needed
RUN apk --no-cache add ca-certificates tzdata

COPY --from=builder /app/dockercrafter-backend .
COPY --from=builder /app/config.yaml .

# Port exposed by the application
EXPOSE 12581

CMD ["./dockercrafter-backend"]
