#!/bin/sh
set -e

echo "Starting WAWPTN..."

echo "Starting backend server..."
exec node packages/backend/dist/index.js
