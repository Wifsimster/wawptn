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
COPY packages/discord/package.json ./packages/discord/

# Install all dependencies
RUN npm ci

# Stage 2: Build types (shared dependency)
FROM deps AS types-builder
WORKDIR /app

COPY packages/types ./packages/types
COPY tsconfig.json ./

RUN npm run build:types

# Stage 3a: Build backend (parallel with frontend)
FROM types-builder AS backend-builder

COPY packages/backend ./packages/backend

RUN npm run build:backend

# Compile migrations to JS (so tsx is not needed at runtime)
RUN cd packages/backend && npx tsc -p tsconfig.migrations.json

# Compile knexfile to JS for production CLI usage (rollback, migrate, etc.)
RUN cd packages/backend && npx tsc knexfile.ts --target ES2022 --module NodeNext --moduleResolution NodeNext --esModuleInterop --skipLibCheck --declaration false --outDir .

# Stage 3b: Build discord bot (parallel with frontend)
FROM types-builder AS discord-builder

COPY packages/discord ./packages/discord

RUN npm run build:discord

# Stage 3c: Build frontend (parallel with backend)
FROM types-builder AS frontend-builder

COPY packages/frontend ./packages/frontend

ARG VERSION
ENV VITE_APP_VERSION=${VERSION}
ENV VITE_API_URL=""
RUN npm run build:frontend

# Stage 4: Production runtime
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
COPY packages/discord/package.json ./packages/discord/

# Install production dependencies only
# --ignore-scripts skips lifecycle scripts like prepare (which runs husky)
RUN npm ci --omit=dev --ignore-scripts

# Copy built backend artifacts
COPY --from=backend-builder /app/packages/types/dist ./packages/types/dist
COPY --from=backend-builder /app/packages/backend/dist ./packages/backend/dist

# Copy compiled migrations (JS, no tsx needed)
COPY --from=backend-builder /app/packages/backend/migrations-compiled ./packages/backend/migrations

# Copy compiled knexfile for CLI usage (rollback, migrate, etc.)
COPY --from=backend-builder /app/packages/backend/knexfile.js ./packages/backend/knexfile.js

# Copy built discord bot
COPY --from=discord-builder /app/packages/discord/dist ./packages/discord/dist

# Copy built frontend to be served by Node.js
COPY --from=frontend-builder /app/packages/frontend/dist ./packages/frontend/dist

# Copy startup script
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

# Set ownership of app directory
RUN chown -R wawptn:nodejs /app

# Switch to non-root user
USER wawptn

# Expose port
EXPOSE 8080

ENV PORT=8080
ENV NODE_ENV=production

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:8080/health || exit 1

# Start services
CMD ["/docker-entrypoint.sh"]
