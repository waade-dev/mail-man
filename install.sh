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
echo -e "  ${GREEN}✓${RESET}  Data directories ready at $INSTALL_DIR/data/"

# ── Done ───────────────────────────────────────────────────
echo ""
echo -e "${BOLD}${GREEN}  ✉  mail-man is ready!${RESET}"
echo ""
echo -e "  ${DIM}Getting started:${RESET}"
echo -e "    ${CYAN}mm start${RESET}                  # open the visual dashboard"
echo -e "    ${CYAN}mm env new dev${RESET}             # create an environment"
echo -e "    ${CYAN}mm env set dev BASE_URL http://localhost:3000${RESET}"
echo -e "    ${CYAN}mm env use dev${RESET}"
echo -e "    ${CYAN}mm new my-api${RESET}              # create a collection"
echo -e "    ${CYAN}mm add my-api${RESET}              # add a request (interactive)"
echo -e "    ${CYAN}mm run my-api${RESET}              # run a request"
echo -e "    ${CYAN}mm beautify${RESET}                # view last response in Chrome"
echo -e "    ${CYAN}mm stop${RESET}                    # stop the dashboard"
echo -e "    ${CYAN}mm --help${RESET}                  # all commands"
echo ""
