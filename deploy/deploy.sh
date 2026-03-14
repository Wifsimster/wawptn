#!/bin/sh
# deploy.sh — Restricted deploy script for WAWPTN
# This script is called by GitHub Actions via SSH (command= restricted key).
# It pulls the latest Docker images and restarts app services.
# Postgres is intentionally excluded — never restart the database from CI.

set -eu

COMPOSE_DIR="${WAWPTN_COMPOSE_DIR:-/opt/wawptn}"

echo "[deploy] Pulling latest images..."
docker compose -f "$COMPOSE_DIR/compose.yml" pull wawptn wawptn-discord

echo "[deploy] Restarting services..."
docker compose -f "$COMPOSE_DIR/compose.yml" up -d wawptn wawptn-discord

echo "[deploy] Cleaning up old images..."
docker image prune -f

echo "[deploy] Done."
