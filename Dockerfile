# Build arguments
ARG VERSION=dev
ARG BUILD_DATE
ARG VCS_REF

# Stage 1: Install dependencies
FROM node:24-alpine AS deps
WORKDIR /app

# Copy workspace configuration
COPY package.json package-lock.json ./
COPY packages/types/package.json ./packages/types/
COPY packages/backend/package.json ./packages/backend/
COPY packages/frontend/package.json ./packages/frontend/

# Install all dependencies
RUN npm ci

# Stage 2: Build everything
FROM deps AS builder
WORKDIR /app

# Copy source files
COPY packages/types ./packages/types
COPY packages/backend ./packages/backend
COPY packages/frontend ./packages/frontend
COPY tsconfig.json ./

# Build types first (shared dependency)
RUN npm run build:types

# Build backend
RUN npm run build:backend

# Build frontend (API calls go to same origin /api)
# Pass version to frontend build
ARG VERSION
ENV VITE_APP_VERSION=${VERSION}
ENV VITE_API_URL=""
RUN npm run build:frontend

# Stage 3: Production runtime
FROM node:24-alpine AS runner

# Build arguments for labels
ARG VERSION
ARG BUILD_DATE
ARG VCS_REF

# Image metadata
LABEL org.opencontainers.image.title="WAWPTN" \
    org.opencontainers.image.description="What Are We Playing Tonight?" \
    org.opencontainers.image.version="${VERSION}" \
    org.opencontainers.image.created="${BUILD_DATE}" \
    org.opencontainers.image.revision="${VCS_REF}" \
    org.opencontainers.image.source="https://github.com/wifsimster/wawptn" \
    org.opencontainers.image.vendor="wifsimster" \
    maintainer="wifsimster"

WORKDIR /app

# Create non-root user for node app
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 wawptn

# Copy package files for production install
COPY package.json package-lock.json ./
COPY packages/types/package.json ./packages/types/
COPY packages/backend/package.json ./packages/backend/

# Install production dependencies only + tsx for migrations + better-auth CLI
# --ignore-scripts skips lifecycle scripts like prepare (which runs husky)
RUN npm ci --omit=dev --ignore-scripts && npm install -w @wawptn/backend tsx @better-auth/cli

# Copy built backend artifacts
COPY --from=builder /app/packages/types/dist ./packages/types/dist
COPY --from=builder /app/packages/backend/dist ./packages/backend/dist

# Copy migrations and knexfile
COPY packages/backend/migrations ./packages/backend/migrations
COPY packages/backend/knexfile.ts ./packages/backend/knexfile.ts

# Copy built frontend to be served by Node.js
COPY --from=builder /app/packages/frontend/dist ./packages/frontend/dist

# Set ownership of app directory
RUN chown -R wawptn:nodejs /app

# Expose port (Node.js serves on 80)
EXPOSE 80

# Copy startup script
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:80/health || exit 1

# Start services
CMD ["/docker-entrypoint.sh"]
