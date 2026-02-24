#!/bin/bash
# OpenBrain Sync Installer
# Connects your local OpenClaw agent to the OpenBrain cloud dashboard.
#
# Usage: curl -fsSL https://openbrain.space/install.sh | bash
#
set -euo pipefail

BOLD='\033[1m'
DIM='\033[2m'
GREEN='\033[32m'
CYAN='\033[36m'
RED='\033[31m'
RESET='\033[0m'

INSTALL_DIR="$HOME/.openbrain"
SYNC_SCRIPT="$INSTALL_DIR/sync.sh"
PLIST_PATH="$HOME/Library/LaunchAgents/com.openbrain.sync.plist"

echo ""
echo -e "${BOLD}  OpenBrain Sync Installer${RESET}"
echo -e "${DIM}  Connects your local OpenClaw to openbrain.space${RESET}"
echo ""

# ── Check dependencies ──
if ! command -v node &>/dev/null; then
  echo -e "${RED}  Node.js is required but not installed.${RESET}"
  echo -e "  Install it: ${CYAN}brew install node${RESET} or visit https://nodejs.org"
  exit 1
fi

if ! command -v curl &>/dev/null; then
  echo -e "${RED}  curl is required but not installed.${RESET}"
  exit 1
fi

# ── Get API key ──
if [ -n "${OPENBRAIN_API_KEY:-}" ]; then
  API_KEY="$OPENBRAIN_API_KEY"
  echo -e "  Using API key from environment"
else
  echo -e "  ${BOLD}Enter your OpenBrain API key${RESET}"
  echo -e "  ${DIM}(Find it in Settings > API Key on openbrain.space)${RESET}"
  echo ""
  printf "  API key: "
  read -r API_KEY
fi

if [ -z "$API_KEY" ]; then
  echo -e "\n  ${RED}No API key provided. Aborting.${RESET}"
  exit 1
fi

# ── Validate API key ──
echo ""
echo -e "  Validating API key..."
RESP=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $API_KEY" https://openbrain.space/api/modules 2>&1)
if [ "$RESP" != "200" ]; then
  echo -e "  ${RED}Invalid API key (HTTP $RESP). Check your key and try again.${RESET}"
  exit 1
fi
echo -e "  ${GREEN}API key valid${RESET}"

# ── Create install directory ──
mkdir -p "$INSTALL_DIR"

# ── Write sync script ──
cat > "$SYNC_SCRIPT" << 'SYNCEOF'
#!/bin/bash
# OpenBrain Sync Agent — pushes local OpenClaw data to the cloud.
# Managed by com.openbrain.sync LaunchAgent.

OPENBRAIN_URL="${OPENBRAIN_URL:-https://openbrain.space}"
API_KEY="${OPENBRAIN_API_KEY}"
CLAWD_DIR="$HOME/clawd"
DATA_DIR="$CLAWD_DIR/marketing"
LOG="/tmp/openbrain-sync.log"
INTERVAL="${SYNC_INTERVAL:-60}"

log() { echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) $1" >> "$LOG"; }

log "Sync started (interval: ${INTERVAL}s)"

while true; do
  PAYLOAD=$(node -e "
    const fs = require('fs'), path = require('path'), os = require('os');
    const d = process.env.DATA_DIR || path.join(os.homedir(), 'clawd', 'marketing');
    const clawd = process.env.CLAWD_DIR || path.join(os.homedir(), 'clawd');
    const payload = {};
    const tryRead = f => { try { return JSON.parse(fs.readFileSync(f,'utf-8')); } catch { return null; } };

    const files = [
      ['tasks', path.join(d,'.taskpipe','tasks.json')],
      ['leads', path.join(d,'.leadpipe','leads.json')],
      ['content', path.join(d,'.contentq','queue.json')],
      ['activity', path.join(d,'activity.json')],
      ['stats', path.join(d,'.taskpipe','stats.json')],
      ['config', path.join(d,'config.json')],
      ['inbox', path.join(d,'inbox.json')],
    ];
    for (const [k,f] of files) { const v = tryRead(f); if (v) payload[k] = v; }
    if (!payload.stats) { const v = tryRead(path.join(d,'stats.json')); if (v) payload.stats = v; }

    try {
      const memDir = path.join(clawd, 'memory');
      const entries = fs.readdirSync(memDir).filter(f => f.endsWith('.md'));
      const memFiles = entries.map(f => {
        const fp = path.join(memDir, f);
        const stat = fs.statSync(fp);
        const content = fs.readFileSync(fp, 'utf-8');
        return { name: f, modified: stat.mtime.toISOString(), preview: content.slice(0,100), lines: content.split('\\\\n').length };
      }).sort((a,b) => new Date(b.modified) - new Date(a.modified));
      payload.memory = { files: memFiles };
    } catch {}

    try {
      const cfg = JSON.parse(fs.readFileSync(path.join(os.homedir(),'.openclaw','openclaw.json'),'utf-8'));
      if (cfg?.agents) {
        const mdFiles = ['SOUL.md','IDENTITY.md','USER.md','TOOLS.md','AGENTS.md','HEARTBEAT.md'];
        const agents = (cfg.agents.list||[]).map(a => {
          const agent = {...a};
          delete agent.apiKey; delete agent.token; delete agent.secret;
          if (a.workspace) {
            const files = {};
            for (const name of mdFiles) {
              try { files[name] = fs.readFileSync(path.join(a.workspace,name),'utf-8').trim()||null; } catch { files[name]=null; }
            }
            agent._files = files;
          }
          return agent;
        });
        payload.agents_config = { agents, defaults: cfg.agents.defaults || {} };
      }
    } catch {}

    process.stdout.write(JSON.stringify(payload));
  " 2>/dev/null)

  if [ -n "$PAYLOAD" ] && [ "$PAYLOAD" != "{}" ]; then
    RESP=$(curl -s -X POST \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer $API_KEY" \
      "$OPENBRAIN_URL/api/sync/push" \
      -d "$PAYLOAD" 2>&1)
    log "Sync: $RESP"
  fi

  sleep "$INTERVAL"
done
SYNCEOF

chmod +x "$SYNC_SCRIPT"

# ── Write config ──
cat > "$INSTALL_DIR/config.json" << EOF
{"mode":"cloud","api_url":"https://openbrain.space","api_key":"$API_KEY"}
EOF

# ── Create LaunchAgent ──
mkdir -p "$HOME/Library/LaunchAgents"
cat > "$PLIST_PATH" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>Label</key>
    <string>com.openbrain.sync</string>
    <key>Comment</key>
    <string>Syncs local OpenClaw data to OpenBrain cloud</string>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>ProgramArguments</key>
    <array>
      <string>/bin/bash</string>
      <string>$SYNC_SCRIPT</string>
    </array>
    <key>StandardOutPath</key>
    <string>/tmp/openbrain-sync-stdout.log</string>
    <key>StandardErrorPath</key>
    <string>/tmp/openbrain-sync-stderr.log</string>
    <key>EnvironmentVariables</key>
    <dict>
      <key>HOME</key>
      <string>$HOME</string>
      <key>PATH</key>
      <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
      <key>OPENBRAIN_API_KEY</key>
      <string>$API_KEY</string>
      <key>OPENBRAIN_URL</key>
      <string>https://openbrain.space</string>
      <key>SYNC_INTERVAL</key>
      <string>60</string>
    </dict>
  </dict>
</plist>
EOF

# ── Start the sync agent ──
launchctl unload "$PLIST_PATH" 2>/dev/null || true
launchctl load "$PLIST_PATH"

echo ""
echo -e "  ${GREEN}${BOLD}Sync installed and running!${RESET}"
echo ""
echo -e "  ${DIM}Syncing every 60 seconds to openbrain.space${RESET}"
echo -e "  ${DIM}Config:  $INSTALL_DIR/config.json${RESET}"
echo -e "  ${DIM}Logs:    /tmp/openbrain-sync.log${RESET}"
echo ""
echo -e "  ${BOLD}Commands:${RESET}"
echo -e "  ${CYAN}launchctl list | grep openbrain${RESET}  — check status"
echo -e "  ${CYAN}tail -f /tmp/openbrain-sync.log${RESET}  — watch sync log"
echo ""
echo -e "  To uninstall:"
echo -e "  ${CYAN}launchctl unload ~/Library/LaunchAgents/com.openbrain.sync.plist${RESET}"
echo -e "  ${CYAN}rm -rf ~/.openbrain ~/Library/LaunchAgents/com.openbrain.sync.plist${RESET}"
echo ""
