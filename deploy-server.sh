#!/usr/bin/env bash
set -euo pipefail

REPO=/opt/openbrain-repo
APP=/opt/open-brain

cd "$REPO"
git pull origin main

# Install ALL deps (including devDependencies for build)
npm ci

# Build server
npx tsc

# Build client (needs Supabase env vars baked in)
cd client
npm ci
source "$APP/.env.build"
VITE_SUPABASE_URL="$VITE_SUPABASE_URL" \
VITE_SUPABASE_ANON_KEY="$VITE_SUPABASE_ANON_KEY" \
npx vite build --outDir "$APP/public"
cd ..

# Copy server build + config to app dir
mkdir -p "$APP/dist"
cp -r dist/* "$APP/dist/"
cp ecosystem.config.cjs "$APP/" 2>/dev/null || true
cp package.json package-lock.json "$APP/"

# Install only production deps in app dir
cd "$APP"
npm ci --omit=dev

# Restart
pm2 restart open-brain || pm2 start ecosystem.config.cjs

echo "Deploy complete: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
