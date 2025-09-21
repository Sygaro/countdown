#!/usr/bin/env bash
# tools/ntp.sh — Sett lokal NTP-server for systemd-timesyncd via drop-in
set -euo pipefail

NTP_SERVER="${1:-ntp.uio.no}"     # bruk "tools/ntp.sh <server>", default ntp.uio.no
CONF_DIR="/etc/systemd/timesyncd.conf.d"
DROPIN="$CONF_DIR/10-local.conf"

if [[ "${NTP_SERVER}" == "--unset" || "${NTP_SERVER}" == "off" ]]; then
  echo "==> Fjerner lokal drop-in for timesyncd …"
  rm -f "${DROPIN}"
else
  echo "==> Setter NTP-server til: ${NTP_SERVER}"
  sudo mkdir -p "${CONF_DIR}"
  sudo tee "${DROPIN}" >/dev/null <<EOF
[Time]
NTP=${NTP_SERVER}
EOF
fi

# Slå på NTP og (re)start tjenesten trygt
echo "==> Aktiverer og restart-er systemd-timesyncd …"
sudo timedatectl set-ntp true || true
sudo systemctl enable --now systemd-timesyncd.service || true
sudo systemctl restart systemd-timesyncd.service || true

# Liten status-visning
echo "==> Gjeldende timedatectl-status:"
timedatectl show-timesync | sed -n '1,25p'
