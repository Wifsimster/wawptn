#!/bin/sh
set -e

echo "Starting WAWPTN..."

# Run better-auth migrations
echo "Running better-auth migrations..."
cd /app/packages/backend
npx @better-auth/cli migrate
cd /app

# Start the backend server (knex migrations run programmatically on startup)
echo "Starting backend server..."
exec node packages/backend/dist/index.js
