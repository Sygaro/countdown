#!/usr/bin/env bash
set -Eeuo pipefail

URL="${1:-http://127.0.0.1:5000/}"

# Minimal vindusbehandler
matchbox-window-manager -use_titlebar no -use_cursor no &
WM_PID=$!
trap 'kill $WM_PID 2>/dev/null || true' EXIT

# Liten pust for X
sleep 0.7

log(){ printf "%s [session] %s\n" "$(date --iso-8601=seconds)" "$*" | systemd-cat -t kiosk-session; }

# Respawn-løkke (ikke bruk pipe til logger; logg til fil)
while true; do
  log "starter chromium mot $URL"
  RC=0
  /home/reidar/countdown/kiosk.sh "$URL" >>/home/reidar/kiosk-chromium.log 2>&1 || RC=$?
  log "chromium avsluttet rc=$RC - restarter om 2s"
  sleep 2
done
