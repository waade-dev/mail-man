#!/usr/bin/env bash
# ─────────────────────────────────────────────
#  ✉  mail-man  —  installer
# ─────────────────────────────────────────────
set -euo pipefail

BOLD="\033[1m"
GREEN="\033[32m"
CYAN="\033[36m"
RED="\033[31m"
YELLOW="\033[33m"
DIM="\033[2m"
RESET="\033[0m"

INSTALL_DIR="$HOME/Developer/mail-man"

echo ""
echo -e "${BOLD}${CYAN}  ✉  mail-man installer${RESET}"
echo -e "${CYAN}  ─────────────────────────────${RESET}"
echo ""

# ── Node.js check ──────────────────────────────────────────
if ! command -v node &>/dev/null; then
  echo -e "  ${RED}✗  Node.js is not installed.${RESET}"
  echo -e "     Install it from ${CYAN}https://nodejs.org${RESET} (v16 or later)"
  exit 1
fi

NODE_VER=$(node -e "process.stdout.write(process.versions.node)")
NODE_MAJOR=$(echo "$NODE_VER" | cut -d. -f1)

if [ "$NODE_MAJOR" -lt 16 ]; then
  echo -e "  ${RED}✗  Node.js v16+ required (found v${NODE_VER})${RESET}"
  exit 1
fi
echo -e "  ${GREEN}✓${RESET}  Node.js v${NODE_VER}"

# ── npm check ──────────────────────────────────────────────
if ! command -v npm &>/dev/null; then
  echo -e "  ${RED}✗  npm not found${RESET}"
  exit 1
fi
echo -e "  ${GREEN}✓${RESET}  npm v$(npm --version)"

# ── Project directory ──────────────────────────────────────
if [ ! -d "$INSTALL_DIR" ]; then
  echo -e "  ${RED}✗  Directory not found: $INSTALL_DIR${RESET}"
  echo -e "     Clone or move the project there first."
  exit 1
fi
echo -e "  ${GREEN}✓${RESET}  Project at $INSTALL_DIR"

# ── Install dependencies ───────────────────────────────────
echo ""
echo -e "  ${CYAN}→${RESET}  Installing npm dependencies..."
cd "$INSTALL_DIR"
npm install --silent
echo -e "  ${GREEN}✓${RESET}  Dependencies installed"

# ── Permissions ────────────────────────────────────────────
chmod +x "$INSTALL_DIR/bin/mm"
echo -e "  ${GREEN}✓${RESET}  bin/mm is executable"

# ── Global link ────────────────────────────────────────────
echo -e "  ${CYAN}→${RESET}  Linking mm globally..."
if npm link 2>/dev/null; then
  echo -e "  ${GREEN}✓${RESET}  mm linked — available as a global command"
else
  echo -e "  ${YELLOW}⚠${RESET}  Global link failed. Try:  ${CYAN}sudo npm link${RESET}"
  echo -e "     Or add ${CYAN}$INSTALL_DIR/bin${RESET} to your PATH."
fi

# ── Data directories ───────────────────────────────────────
mkdir -p "$INSTALL_DIR/data/collections"
mkdir -p "$INSTALL_DIR/data/environments"
mkdir -p "$INSTALL_DIR/data/logs"
echo -e "  ${GREEN}✓${RESET}  Data directories ready at $INSTALL_DIR/data/"

# ── LaunchAgent (macOS service) ────────────────────────────
if [[ "$OSTYPE" == "darwin"* ]]; then
  echo ""
  echo -e "  ${CYAN}→${RESET}  Installing macOS LaunchAgent..."

  LABEL="com.mailman.server"
  PLIST_DIR="$HOME/Library/LaunchAgents"
  PLIST_PATH="$PLIST_DIR/${LABEL}.plist"
  NODE_BIN="$(which node)"
  LOG_DIR="$INSTALL_DIR/data/logs"

  mkdir -p "$PLIST_DIR"

  # Unload any existing version first
  launchctl unload "$PLIST_PATH" 2>/dev/null || true

  # Generate the plist
  cat > "$PLIST_PATH" <<PLIST_EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>${LABEL}</string>

    <key>ProgramArguments</key>
    <array>
        <string>${NODE_BIN}</string>
        <string>${INSTALL_DIR}/src/server/index.js</string>
    </array>

    <key>WorkingDirectory</key>
    <string>${INSTALL_DIR}</string>

    <!-- Start manually with: mm start -->
    <key>RunAtLoad</key>
    <false/>

    <!-- Do not auto-restart — explicit control via mm start / mm stop -->
    <key>KeepAlive</key>
    <false/>

    <key>StandardOutPath</key>
    <string>${LOG_DIR}/server.log</string>

    <key>StandardErrorPath</key>
    <string>${LOG_DIR}/server-error.log</string>

    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
    </dict>
</dict>
</plist>
PLIST_EOF

  # Register (load) the service
  if launchctl load "$PLIST_PATH" 2>/dev/null; then
    echo -e "  ${GREEN}✓${RESET}  LaunchAgent registered: ${LABEL}"
    echo -e "  ${GREEN}✓${RESET}  Logs  →  $LOG_DIR/"
    echo -e "  ${DIM}     Plist →  $PLIST_PATH${RESET}"
  else
    echo -e "  ${YELLOW}⚠${RESET}  Could not register LaunchAgent (non-fatal)"
    echo -e "     ${DIM}mm start/stop will fall back to direct process management${RESET}"
  fi
fi

# ── Done ───────────────────────────────────────────────────
echo ""
echo -e "${BOLD}${GREEN}  ✉  mail-man is ready!${RESET}"
echo ""
echo -e "  ${DIM}Getting started:${RESET}"
echo ""
echo -e "  ${DIM}# Dashboard${RESET}"
echo -e "    ${CYAN}mm start${RESET}                              # open visual dashboard in Chrome"
echo -e "    ${CYAN}mm stop${RESET}                               # stop the dashboard server"
echo ""
echo -e "  ${DIM}# Set up an environment${RESET}"
echo -e "    ${CYAN}mm env new dev${RESET}"
echo -e "    ${CYAN}mm env set dev BASE_URL http://localhost:3000${RESET}"
echo -e "    ${CYAN}mm env set dev TOKEN your-token-here${RESET}"
echo -e "    ${CYAN}mm env use dev${RESET}"
echo ""
echo -e "  ${DIM}# Manage requests${RESET}"
echo -e "    ${CYAN}mm add my-api/get-users${RESET}               # add a request (interactive)"
echo -e "    ${CYAN}mm ls${RESET}                                 # list all collections + requests"
echo -e "    ${CYAN}mm hit my-api/get-users${RESET}               # fire a request"
echo ""
echo -e "  ${DIM}# View in Chrome${RESET}"
echo -e "    ${CYAN}mm b-req my-api/get-users${RESET}             # view request definition"
echo -e "    ${CYAN}mm b-res my-api/get-users${RESET}             # view last response"
echo ""
echo -e "  ${DIM}# History${RESET}"
echo -e "    ${CYAN}mm history${RESET}                            # global last 50"
echo -e "    ${CYAN}mm history my-api/get-users${RESET}           # per-request history"
echo ""
echo -e "    ${CYAN}mm --help${RESET}                             # all commands"
echo ""
