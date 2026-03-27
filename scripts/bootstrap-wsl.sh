#!/usr/bin/env bash
set -euo pipefail

log() {
  printf "[bootstrap-wsl] %s\n" "$1"
}

if ! command -v apt-get >/dev/null 2>&1; then
  log "apt-get not found; this script assumes Ubuntu/Debian."
  exit 1
fi

log "Installing base packages..."
sudo apt-get update
sudo apt-get install -y curl wget gnupg ca-certificates

if ! command -v node >/dev/null 2>&1 || [[ "$(node -v | sed 's/^v//')" != 22.* ]]; then
  log "Installing Node.js 22 (NodeSource)..."
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
else
  log "Node.js 22 already installed."
fi

if command -v corepack >/dev/null 2>&1; then
  log "Enabling corepack..."
  corepack enable
fi

if ! command -v google-chrome >/dev/null 2>&1; then
  log "Installing Google Chrome (WSL native)..."
  wget -qO- https://dl.google.com/linux/linux_signing_key.pub \
    | gpg --dearmor \
    | sudo tee /usr/share/keyrings/google-linux-signing-keyring.gpg >/dev/null
  echo "deb [arch=amd64 signed-by=/usr/share/keyrings/google-linux-signing-keyring.gpg] http://dl.google.com/linux/chrome/deb/ stable main" \
    | sudo tee /etc/apt/sources.list.d/google-chrome.list >/dev/null
  sudo apt-get update
  sudo apt-get install -y google-chrome-stable
else
  log "Google Chrome already installed."
fi

if [[ -f package.json ]]; then
  log "Installing repo dependencies..."
  pnpm install
else
  log "package.json not found; run this script from the repo root."
fi

log "Done. Next steps:"
log "  - Set AURACALL_BROWSER_REMOTE_DEBUG_HOST=127.0.0.1 in ~/.zshrc"
log "  - Run: oracle login --target chatgpt --browser-keep-browser"
