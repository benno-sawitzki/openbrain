#!/bin/bash
# Starts a cloudflared tunnel for the OpenClaw gateway and updates the
# gateway URL in the OpenBrain workspace automatically.
#
# Usage: ./gateway-tunnel.sh
# Runs as a LaunchAgent via com.openbrain.tunnel.plist

GATEWAY_PORT="${OPENCLAW_GATEWAY_PORT:-18789}"
OPENBRAIN_API_KEY="${OPENBRAIN_API_KEY:-ob_e4aef03634969fae22559749c65041c9}"
OPENBRAIN_URL="${OPENBRAIN_URL:-https://openbrain.space}"
LOG="/tmp/openbrain-tunnel.log"

echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) Starting tunnel for localhost:$GATEWAY_PORT" >> "$LOG"

# Start cloudflared and capture the URL from stderr
cloudflared tunnel --url "http://localhost:$GATEWAY_PORT" 2>&1 | while IFS= read -r line; do
  echo "$line" >> "$LOG"
  # Look for the tunnel URL in the output
  if echo "$line" | grep -q "trycloudflare.com"; then
    TUNNEL_URL=$(echo "$line" | grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com')
    if [ -n "$TUNNEL_URL" ]; then
      WSS_URL="wss://${TUNNEL_URL#https://}"
      echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) Tunnel URL: $WSS_URL" >> "$LOG"
      # Update the gateway URL in OpenBrain via API
      curl -s -X POST \
        -H "Authorization: Bearer $OPENBRAIN_API_KEY" \
        -H "Content-Type: application/json" \
        "$OPENBRAIN_URL/api/gateway/save" \
        -d "{\"gateway_url\":\"$WSS_URL\"}" >> "$LOG" 2>&1
      echo "" >> "$LOG"
    fi
  fi
done
