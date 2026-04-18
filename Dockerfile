# syntax=docker/dockerfile:1.7

# Build arguments
ARG VERSION=dev
ARG BUILD_DATE
ARG VCS_REF
ARG NODE_IMAGE=node:24-alpine

# ---------------------------------------------------------------
# Stage 1a: Install ALL dependencies (build-time)
# ---------------------------------------------------------------
FROM ${NODE_IMAGE} AS deps
WORKDIR /app

# Copy workspace manifests only — maximises layer cache hits
COPY package.json package-lock.json ./
COPY packages/types/package.json ./packages/types/
COPY packages/backend/package.json ./packages/backend/
COPY packages/frontend/package.json ./packages/frontend/
COPY packages/discord/package.json ./packages/discord/

RUN --mount=type=cache,target=/root/.npm,sharing=locked \
    npm ci --prefer-offline --no-audit --no-fund

# ---------------------------------------------------------------
# Stage 1b: Install PRODUCTION dependencies (runtime)
# Runs in parallel with the builders — avoids a second sequential
# npm ci in the runner stage.
# ---------------------------------------------------------------
FROM ${NODE_IMAGE} AS prod-deps
WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/types/package.json ./packages/types/
COPY packages/backend/package.json ./packages/backend/
COPY packages/discord/package.json ./packages/discord/

RUN --mount=type=cache,target=/root/.npm,sharing=locked \
    npm ci --omit=dev --ignore-scripts --prefer-offline --no-audit --no-fund

# ---------------------------------------------------------------
# Stage 2: Build shared types
# ---------------------------------------------------------------
FROM deps AS types-builder
COPY tsconfig.json ./
COPY packages/types ./packages/types
RUN npm run build:types

# ---------------------------------------------------------------
# Stage 3a: Build backend (+ migrations + knexfile)
# ---------------------------------------------------------------
FROM types-builder AS backend-builder
COPY packages/backend ./packages/backend
RUN npm run build:backend \
 && cd packages/backend \
 && npx tsc -p tsconfig.migrations.json \
 && npx tsc knexfile.ts \
        --target ES2022 --module NodeNext --moduleResolution NodeNext \
        --esModuleInterop --skipLibCheck --declaration false --outDir .

# ---------------------------------------------------------------
# Stage 3b: Build discord bot
# ---------------------------------------------------------------
FROM types-builder AS discord-builder
COPY packages/discord ./packages/discord
RUN npm run build:discord

# ---------------------------------------------------------------
# Stage 3c: Build frontend
# ---------------------------------------------------------------
FROM types-builder AS frontend-builder
ARG VERSION
ENV NODE_ENV=production \
    VITE_APP_VERSION=${VERSION}
COPY packages/frontend ./packages/frontend
RUN npm run build:frontend

# ---------------------------------------------------------------
# Stage 4: Production runtime
# ---------------------------------------------------------------
FROM ${NODE_IMAGE} AS runner

ARG VERSION
ARG BUILD_DATE
ARG VCS_REF

LABEL org.opencontainers.image.title="WAWPTN" \
    org.opencontainers.image.description="What Are We Playing Tonight?" \
    org.opencontainers.image.version="${VERSION}" \
    org.opencontainers.image.created="${BUILD_DATE}" \
    org.opencontainers.image.revision="${VCS_REF}" \
    org.opencontainers.image.source="https://github.com/wifsimster/wawptn" \
    org.opencontainers.image.vendor="wifsimster" \
    maintainer="wifsimster"

WORKDIR /app

RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 --ingroup nodejs wawptn

# Pre-installed production node_modules (no second npm ci)
COPY --from=prod-deps --chown=wawptn:nodejs /app/node_modules ./node_modules
COPY --chown=wawptn:nodejs package.json package-lock.json ./
COPY --chown=wawptn:nodejs packages/types/package.json ./packages/types/
COPY --chown=wawptn:nodejs packages/backend/package.json ./packages/backend/
COPY --chown=wawptn:nodejs packages/discord/package.json ./packages/discord/

# Built artifacts (chown at copy time — no recursive chown layer)
COPY --from=backend-builder --chown=wawptn:nodejs /app/packages/types/dist ./packages/types/dist
COPY --from=backend-builder --chown=wawptn:nodejs /app/packages/backend/dist ./packages/backend/dist
COPY --from=backend-builder --chown=wawptn:nodejs /app/packages/backend/migrations-compiled ./packages/backend/migrations
COPY --from=backend-builder --chown=wawptn:nodejs /app/packages/backend/knexfile.js ./packages/backend/knexfile.js
COPY --from=discord-builder --chown=wawptn:nodejs /app/packages/discord/dist ./packages/discord/dist
COPY --from=frontend-builder --chown=wawptn:nodejs /app/packages/frontend/dist ./packages/frontend/dist

COPY --chown=wawptn:nodejs --chmod=755 docker-entrypoint.sh /docker-entrypoint.sh

USER wawptn

EXPOSE 8080

ENV PORT=8080 \
    NODE_ENV=production

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:8080/health || exit 1

CMD ["/docker-entrypoint.sh"]
