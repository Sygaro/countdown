#!/usr/bin/env bash
set -euo pipefail
CFG="${1:-/home/reidar/countdown/config.json}"
echo "Watching $CFG ..."
if ! command -v inotifywait >/dev/null 2>&1; then
  echo "Install inotify-tools: sudo apt update && sudo apt install -y inotify-tools"
  exit 1
fi
while inotifywait -e modify,attrib,move,create,delete "$(dirname "$CFG")"; do
  date
  ls -l --time-style='+%F %T' "$CFG" || true
  stat "$CFG" || true
  echo "SHA256:"
  sha256sum "$CFG" || true
  echo "----"
done
