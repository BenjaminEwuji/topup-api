# ── Build stage ──────────────────────────────────────────────
FROM node:20-alpine AS build

WORKDIR /app

# Install dependencies first (layer cache optimization)
COPY package*.json ./
RUN npm ci

# Copy source and build
COPY . .
RUN npm run buildc

# ── Production stage ──────────────────────────────────────────
FROM node:20-alpine

LABEL maintainer="TopUpNG"
LABEL description="TopUpNG API - NestJS backend"

WORKDIR /app

# Set environment
ENV NODE_ENV=production \
    PORT=3333

# Install only production dependencies
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy compiled output from build stage
COPY --from=build /app/dist ./dist

# Create and use a non-root user for security
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

# Expose the app port
EXPOSE 3333

# Health check — hits the root endpoint every 30s
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:3333 || exit 1

CMD ["node", "dist/main"]