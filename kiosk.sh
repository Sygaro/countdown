#!/usr/bin/env bash
set -euo pipefail
URL="${1:-http://127.0.0.1:5000/}"

CHROME_BIN="$(command -v chromium || command -v chromium-browser || true)"
[ -n "$CHROME_BIN" ] || { echo "[kiosk] Chromium ikke funnet"; exit 1; }

PROFILE_DIR="/home/reidar/.config/chromium-kiosk"
mkdir -p "$PROFILE_DIR" /dev/shm/chromium-cache

COMMON_FLAGS=(
  "--user-data-dir=$PROFILE_DIR"
  "--disk-cache-dir=/dev/shm/chromium-cache"
  "--new-window" "--start-fullscreen" "$URL"
  "--incognito" "--no-first-run" "--no-default-browser-check"
  "--disable-session-crashed-bubble" "--disable-translate"
  "--lang=nb" "--overscroll-history-navigation=0" "--disable-pinch"
  "--noerrdialogs" "--disable-infobars"
  "--autoplay-policy=no-user-gesture-required"
  "--enable-features=UseOzonePlatform"
  "--use-gl=egl" "--enable-zero-copy" "--ignore-gpu-blocklist"
  "--ozone-platform=wayland"
)

pkill -f "chromium.*--user-data-dir=$PROFILE_DIR" || true
sleep 1
# Ekstra flagg fra miljø
[ -n "${CHROMIUM_FLAGS:-}" ] && EXTRA=(${CHROMIUM_FLAGS}) || EXTRA=()

exec "$CHROME_BIN" "${COMMON_FLAGS[@]}" "${EXTRA[@]}"
