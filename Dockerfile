ARG VERSION=dev
ARG BUILD_DATE
ARG VCS_REF

# Stage 1: Install dependencies
FROM node:24-alpine AS deps
WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/types/package.json ./packages/types/
COPY packages/backend/package.json ./packages/backend/
COPY packages/frontend/package.json ./packages/frontend/

RUN npm ci

# Stage 2: Build everything
FROM deps AS builder
WORKDIR /app

COPY packages/types ./packages/types
COPY packages/backend ./packages/backend
COPY packages/frontend ./packages/frontend
COPY tsconfig.json ./

RUN npm run build:types
RUN npm run build:backend

ARG VERSION
ENV VITE_APP_VERSION=${VERSION}
ENV VITE_API_URL=""
RUN npm run build:frontend

# Stage 3: Production runtime
FROM node:24-alpine AS runner

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

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 wawptn

COPY package.json package-lock.json ./
COPY packages/types/package.json ./packages/types/
COPY packages/backend/package.json ./packages/backend/

RUN npm ci --omit=dev --ignore-scripts && npm install -w @wawptn/backend tsx

COPY --from=builder /app/packages/types/dist ./packages/types/dist
COPY --from=builder /app/packages/backend/dist ./packages/backend/dist

COPY packages/backend/migrations ./packages/backend/migrations
COPY packages/backend/knexfile.ts ./packages/backend/knexfile.ts

COPY --from=builder /app/packages/frontend/dist ./packages/frontend/dist

RUN chown -R wawptn:nodejs /app

EXPOSE 80

COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:80/health || exit 1

CMD ["/docker-entrypoint.sh"]
