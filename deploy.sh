#!/bin/bash
# Open Brain — Deploy to production server
# Usage: ./deploy.sh <user@host>
# Example: ./deploy.sh root@46.225.119.95

set -euo pipefail

HOST="${1:?Usage: ./deploy.sh user@host}"
APP_DIR="/opt/openbrain"

echo "=== Deploying Open Brain to $HOST ==="

# 1. Build locally first
echo "[1/5] Building..."
cd "$(dirname "$0")"
npx tsc
cd client && VITE_SUPABASE_URL="https://gsgtpooxawvdfrtijuut.supabase.co" \
  VITE_SUPABASE_ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdzZ3Rwb294YXd2ZGZydGlqdXV0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzExODc3NzUsImV4cCI6MjA4Njc2Mzc3NX0.u3UOfQUhc7bs1mvFJgokDn2yL82lOZLpZUMbkoTaUeg" \
  npx vite build
cd ..

# 2. Ensure remote directory and Node.js
echo "[2/5] Setting up server..."
ssh "$HOST" "mkdir -p $APP_DIR"

# 3. Sync files (only what's needed to run)
echo "[3/5] Syncing files..."
rsync -avz --delete \
  --include='dist/***' \
  --include='public/***' \
  --include='static/***' \
  --include='package.json' \
  --include='package-lock.json' \
  --include='ecosystem.config.cjs' \
  --include='.env.production' \
  --exclude='*' \
  ./ "$HOST:$APP_DIR/"

# 4. Install production deps & setup env
echo "[4/5] Installing dependencies..."
ssh "$HOST" "cd $APP_DIR && npm ci --omit=dev && cp -n .env.production .env 2>/dev/null || true"

# 5. Start/restart with pm2
echo "[5/5] Starting app..."
ssh "$HOST" "cd $APP_DIR && npx pm2 delete openbrain 2>/dev/null || true && npx pm2 start ecosystem.config.cjs --env production && npx pm2 save"

echo ""
echo "=== Deployed! ==="
echo "App running at http://${HOST##*@}:4000"
echo ""
echo "Next steps:"
echo "  - Set up Caddy/nginx reverse proxy for HTTPS"
echo "  - Point your domain to the server IP"
