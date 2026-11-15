#!/usr/bin/env bash
# Stream Sniper - One-command native messaging host installer (macOS / Linux)
#
# Usage (from the folder containing ytdlp-bridge.py):
#   bash install-native-host.sh
#   bash install-native-host.sh --chrome-id abcdefghijklmnopabcdefghijklmnop
#   bash install-native-host.sh --uninstall
#
# Firefox needs no ID: the extension ships with a fixed ID. Chromium browsers assign an
# ID when the extension is loaded; pass it with --chrome-id (shown on chrome://extensions).

set -euo pipefail

HOST_NAME="com.streamsniper.ytdlp"
FIREFOX_ID="stream-sniper@c0de128.github.io"
CHROME_ID=""
UNINSTALL=0
SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --chrome-id) CHROME_ID="$2"; shift 2 ;;
    --firefox-id) FIREFOX_ID="$2"; shift 2 ;;
    --uninstall) UNINSTALL=1; shift ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

ok()   { printf '  [OK] %s\n' "$1"; }
warn() { printf '  [!!] %s\n' "$1"; }
fail() { printf '  [XX] %s\n' "$1"; exit 1; }
step() { printf '==> %s\n' "$1"; }

if [[ "$(uname)" == "Darwin" ]]; then
  INSTALL_DIR="$HOME/Library/Application Support/StreamSniper"
  FIREFOX_DIR="$HOME/Library/Application Support/Mozilla/NativeMessagingHosts"
  CHROMIUM_DIRS=(
    "$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"
    "$HOME/Library/Application Support/Microsoft Edge/NativeMessagingHosts"
    "$HOME/Library/Application Support/BraveSoftware/Brave-Browser/NativeMessagingHosts"
    "$HOME/Library/Application Support/Chromium/NativeMessagingHosts"
  )
else
  INSTALL_DIR="$HOME/.local/share/StreamSniper"
  FIREFOX_DIR="$HOME/.mozilla/native-messaging-hosts"
  CHROMIUM_DIRS=(
    "$HOME/.config/google-chrome/NativeMessagingHosts"
    "$HOME/.config/microsoft-edge/NativeMessagingHosts"
    "$HOME/.config/BraveSoftware/Brave-Browser/NativeMessagingHosts"
    "$HOME/.config/chromium/NativeMessagingHosts"
  )
fi

if [[ $UNINSTALL -eq 1 ]]; then
  step "Removing Stream Sniper native messaging host"
  rm -f "$FIREFOX_DIR/$HOST_NAME.json" && ok "Firefox manifest removed"
  for d in "${CHROMIUM_DIRS[@]}"; do rm -f "$d/$HOST_NAME.json"; done
  ok "Chromium manifests removed"
  rm -rf "$INSTALL_DIR" && ok "Removed $INSTALL_DIR"
  echo "Done."
  exit 0
fi

echo
echo "Stream Sniper - Native Messaging Host Installer"
echo "================================================"
echo

step "Checking Python"
PYTHON="$(command -v python3 || command -v python || true)"
[[ -n "$PYTHON" ]] || fail "Python 3 not found. Install it and rerun."
ok "Python: $PYTHON"

step "Installing bridge script"
[[ -f "$SOURCE_DIR/ytdlp-bridge.py" ]] || fail "ytdlp-bridge.py not found next to this script."
mkdir -p "$INSTALL_DIR"
cp "$SOURCE_DIR/ytdlp-bridge.py" "$INSTALL_DIR/ytdlp-bridge.py"
chmod +x "$INSTALL_DIR/ytdlp-bridge.py"
# Make the shebang point at the interpreter we found
sed -i.bak "1s|.*|#!$PYTHON|" "$INSTALL_DIR/ytdlp-bridge.py" && rm -f "$INSTALL_DIR/ytdlp-bridge.py.bak"
ok "Installed to $INSTALL_DIR/ytdlp-bridge.py"

step "Writing native messaging manifests"
mkdir -p "$FIREFOX_DIR"
cat > "$FIREFOX_DIR/$HOST_NAME.json" <<EOF
{
  "name": "$HOST_NAME",
  "description": "Stream Sniper native messaging host (yt-dlp, VLC)",
  "path": "$INSTALL_DIR/ytdlp-bridge.py",
  "type": "stdio",
  "allowed_extensions": ["$FIREFOX_ID"]
}
EOF
ok "Firefox: $FIREFOX_DIR/$HOST_NAME.json (extension $FIREFOX_ID)"

if [[ -n "$CHROME_ID" ]]; then
  for d in "${CHROMIUM_DIRS[@]}"; do
    # Only write into browsers that exist on this machine
    [[ -d "$(dirname "$d")" ]] || continue
    mkdir -p "$d"
    cat > "$d/$HOST_NAME.json" <<EOF
{
  "name": "$HOST_NAME",
  "description": "Stream Sniper native messaging host (yt-dlp, VLC)",
  "path": "$INSTALL_DIR/ytdlp-bridge.py",
  "type": "stdio",
  "allowed_origins": ["chrome-extension://$CHROME_ID/"]
}
EOF
    ok "Chromium: $d/$HOST_NAME.json"
  done
else
  warn "No --chrome-id given; skipping Chrome/Edge/Brave. Rerun with the ID from chrome://extensions to enable them."
fi

step "Checking optional tools"
command -v yt-dlp >/dev/null 2>&1 && ok "yt-dlp found" || warn "yt-dlp not found (brew install yt-dlp / pip install yt-dlp)"
command -v ffmpeg >/dev/null 2>&1 && ok "ffmpeg found" || warn "ffmpeg not found (brew install ffmpeg / apt install ffmpeg)"
if command -v vlc >/dev/null 2>&1 || [[ -x "/Applications/VLC.app/Contents/MacOS/VLC" ]]; then ok "VLC found"; else warn "VLC not found; 'Play in VLC' will fall back to playlist files"; fi

echo
echo "Done. Restart your browser, then open Stream Sniper Settings and click 'Test yt-dlp Connection'."
echo
