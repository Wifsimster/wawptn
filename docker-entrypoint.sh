#!/bin/sh
set -e

echo "Starting WAWPTN..."

# Run better-auth migrations first
echo "Running better-auth migrations..."
cd /app/packages/backend
npx @better-auth/cli migrate

# Run database migrations
echo "Running database migrations..."
npx knex migrate:latest --knexfile knexfile.ts
cd /app

# Start the backend server
echo "Starting backend server..."
exec node packages/backend/dist/index.js
