#!/bin/sh

set -eu

COMPOSE_DIR="${WAWPTN_COMPOSE_DIR:-/opt/wawptn}"

echo "[deploy] Pulling latest images..."
docker compose -f "$COMPOSE_DIR/compose.yml" pull wawptn wawptn-discord

echo "[deploy] Restarting services..."
docker compose -f "$COMPOSE_DIR/compose.yml" up -d wawptn wawptn-discord

echo "[deploy] Cleaning up old images..."
docker image prune -f

echo "[deploy] Done."
