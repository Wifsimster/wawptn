#!/bin/sh
set -e

echo "Running database migrations..."
cd /app/packages/backend
npx tsx node_modules/.bin/knex migrate:latest --knexfile knexfile.ts
cd /app

echo "Starting WAWPTN server..."
exec node packages/backend/dist/index.js
