#!/bin/sh
set -e

echo "Starting WAWPTN..."

# Start the backend server (knex migrations run programmatically on startup)
echo "Starting backend server..."
exec node packages/backend/dist/index.js
