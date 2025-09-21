#!/usr/bin/env bash
# Raspberry Pi OS Lite (Bookworm, aarch64) -> Flask (Gunicorn) + Cog/WPE DRM kiosk
# Sikker å kjøre flere ganger (idempotent).
set -euo pipefail
IFS=$'\n\t'

### ─────────────────────────────────────────────────────────────────────────────
### 0) Finn/les riktig brukernavn
###    - Du kan også sette USER_NAME i miljøet før kjøring.
### ─────────────────────────────────────────────────────────────────────────────
if [[ "${EUID}" -ne 0 ]]; then
  echo "Kjør meg med sudo:  sudo bash $0"
  exit 1
fi

if [[ -z "${USER_NAME:-}" ]]; then
  DEFAULT_USER="${SUDO_USER:-${USER:-}}"
  if [[ -z "$DEFAULT_USER" || "$DEFAULT_USER" == "root" ]]; then
    read -rp "Hvilken ordinær bruker skal kjøre appen? " INPUT_USER
    USER_NAME="${INPUT_USER}"
  else
    echo "Foreslått bruker: ${DEFAULT_USER}"
    read -rp "Bruk denne? [Enter=yes / skriv annet brukernavn]: " INPUT_USER || true
    USER_NAME="${INPUT_USER:-$DEFAULT_USER}"
  fi
fi

if ! id "$USER_NAME" &>/dev/null; then
  echo "Fant ikke bruker '${USER_NAME}'. Avbryter."
  exit 1
fi

USER_UID="$(id -u "$USER_NAME")"
USER_HOME="$(getent passwd "$USER_NAME" | cut -d: -f6)"
APP_DIR="${APP_DIR:-${USER_HOME}/countdown}"
VENVDIR="${VENVDIR:-${APP_DIR}/venv}"
USER_SYSTEMD_DIR="${USER_HOME}/.config/systemd/user"
PORT="${PORT:-5000}"

echo "==> Bruker: ${USER_NAME} (UID=${USER_UID})"
echo "==> App-katalog: ${APP_DIR}"
echo "==> Venv: ${VENVDIR}"
echo "==> Port: ${PORT}"

if [[ ! -d "${APP_DIR}" ]]; then
  echo "FEIL: Fant ikke ${APP_DIR}. Legg koden din der først."
  exit 1
fi

### ─────────────────────────────────────────────────────────────────────────────
### 1) Systempakker
### ─────────────────────────────────────────────────────────────────────────────
echo "==> Installerer systempakker…"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y \
  python3-venv git curl \
  cog gstreamer1.0-wpe libwpe-1.0-1 libwpebackend-fdo-1.0-1 libwpewebkit-1.1-0 \
  libegl1-mesa libgles2 libgbm1 \
  avahi-daemon \
  libdrm-tests

# Tilganger til GPU
usermod -aG video,render "$USER_NAME" || true

# Vedvarende journald
mkdir -p /var/log/journal
systemctl restart systemd-journald

echo "==> Slår på NTP og venter-tjeneste for tidssynk…"

# Slå på NTP via systemd-timesyncd (vanlig på Pi OS Lite)
if systemctl list-unit-files | grep -q '^systemd-timesyncd.service'; then
  sudo timedatectl set-ntp true || true
  sudo systemctl enable --now systemd-timesyncd.service || true
fi

# Aktiver 'systemd-time-wait-sync' hvis den finnes (venter til klokke er synk’et)
if systemctl list-unit-files | grep -q '^systemd-time-wait-sync.service'; then
  sudo systemctl enable systemd-time-wait-sync.service || true
  sudo systemctl start  systemd-time-wait-sync.service || true
else
  echo "   → systemd-time-wait-sync.service ikke tilgjengelig på dette imaget (hopper over)."
fi


### ─────────────────────────────────────────────────────────────────────────────
### 2) requirements.txt + venv + pip install
### ─────────────────────────────────────────────────────────────────────────────

REQ_FILE="${APP_DIR}/requirements.txt"
echo "==> Oppdaterer requirements.txt…"
if [[ ! -f "${REQ_FILE}" ]]; then
  cat > "${REQ_FILE}" <<'REQS'
Flask==3.1.2
gunicorn==23.0.0
waitress==3.0.2
blinker==1.9.0
REQS
  chown "${USER_NAME}:${USER_NAME}" "${REQ_FILE}"
else
  echo "==> requirements.txt finnes fra før – beholder den."
fi

echo "==> Setter opp venv og installerer Python-avhengigheter…"
sudo -u "${USER_NAME}" -H bash -lc "
  cd '${APP_DIR}'
  python3 -m venv '${VENVDIR}'
  source '${VENVDIR}/bin/activate'
  pip install --upgrade pip
  pip install -r requirements.txt
"

### ─────────────────────────────────────────────────────────────────────────────
### 3) Lag Gunicorn user-service (uten å være avhengig av user-bus nå)
###     - Vi skriver servicefilen, lager enable-symlink manuelt,
###       og prøver å starte hvis user-bus finnes.
### ─────────────────────────────────────────────────────────────────────────────
echo "==> Lager user-systemd-tjeneste for Flask/Gunicorn…"
install -d -o "${USER_NAME}" -g "${USER_NAME}" "${USER_SYSTEMD_DIR}"
TMP="$(mktemp)"
cat > "${TMP}" <<'UNIT'
[Unit]
Description=Countdown Flask via gunicorn
Wants=network-online.target time-sync.target
After=network-online.target time-sync.target

[Service]
# Vent maks 60s på NTP-synk (beskyttelse hvis time-sync.target ikke oppfører seg)
ExecStartPre=/bin/sh -c 'i=0; while [ $i -lt 60 ]; do \
  s=$(timedatectl show -p NTPSynchronized --value 2>/dev/null || echo no); \
  [ "$s" = "yes" ] && exit 0; sleep 1; i=$((i+1)); done; exit 0'
WorkingDirectory=__APP_DIR__
ExecStart=__APP_DIR__/venv/bin/gunicorn wsgi:app \
  --bind 0.0.0.0:__PORT__ --workers 2 --threads 4 --timeout 0 \
  --access-logfile - --error-logfile -
Environment=PYTHONUNBUFFERED=1
StandardOutput=null
StandardError=journal
Restart=always
RestartSec=2
KillMode=process
TimeoutStopSec=10
NoNewPrivileges=yes


[Install]
WantedBy=default.target
UNIT
sed -i "s#__APP_DIR__#${APP_DIR}#g; s#__VENVDIR__#${VENVDIR}#g; s#__PORT__#${PORT}#g" "${TMP}"
install -o "${USER_NAME}" -g "${USER_NAME}" -m 0644 "${TMP}" "${USER_SYSTEMD_DIR}/countdown.service"
rm -f "${TMP}"

# Enable ved symlink (samme som `systemctl --user enable`)
install -d -o "${USER_NAME}" -g "${USER_NAME}" "${USER_SYSTEMD_DIR}/default.target.wants"
ln -snf "${USER_SYSTEMD_DIR}/countdown.service" \
         "${USER_SYSTEMD_DIR}/default.target.wants/countdown.service"

# Linger -> user-services starter ved boot
loginctl enable-linger "${USER_NAME}" || true

# Start user-manager nå (oppretter /run/user/<uid>)
systemctl start "user@${USER_UID}.service" || true

# Prøv å starte tjenesten med én gang hvis user-bus finnes
RUNDIR="/run/user/${USER_UID}"
if [[ -S "${RUNDIR}/systemd/private" ]]; then
  sudo -u "${USER_NAME}" XDG_RUNTIME_DIR="${RUNDIR}" systemctl --user daemon-reload || true
  sudo -u "${USER_NAME}" XDG_RUNTIME_DIR="${RUNDIR}" systemctl --user start countdown.service || true
  echo "   → countdown.service startet."
else
  echo "   → User-bus ikke oppe nå. Tjenesten er enablet og starter ved neste boot/innlogging."
fi

### ─────────────────────────────────────────────────────────────────────────────
### 4) Oppdag DRM-enhet og HDMI-utgang
### ─────────────────────────────────────────────────────────────────────────────
echo "==> Detekterer aktiv HDMI-connector/DRM-device…"
ACTIVE_OUT="HDMI-A-1"
CARD="card1"
for C in /sys/class/drm/card*-HDMI-A-*; do
  [[ -e "$C/status" ]] || continue
  if [[ "$(cat "$C/status" 2>/dev/null)" == "connected" ]]; then
    BASENAME="$(basename "$C")"      # f.eks. card1-HDMI-A-1
    ACTIVE_OUT="${BASENAME#*-}"      # HDMI-A-1
    CARD="$(sed -E 's/^(card[0-9]+).*/\1/' <<< "$BASENAME")"
    break
  fi
done
DRM_DEV="/dev/dri/${CARD}"
echo "   → ACTIVE_OUT=${ACTIVE_OUT}, DRM_DEV=${DRM_DEV}"

### ─────────────────────────────────────────────────────────────────────────────
### 5) Kiosk som system-service (Cog/DRM på tty1) — med renderer=gles + riktige vars
### ─────────────────────────────────────────────────────────────────────────────
echo "==> Oppretter kiosk (Cog/DRM) som system-service…"
cat > /etc/systemd/system/kiosk-cog.service <<'UNIT'
[Unit]
After=network-online.target systemd-user-sessions.service user@__USER_UID__.service time-sync.target
Wants=network-online.target user@__USER_UID__.service time-sync.target

Description=Kiosk (Cog on DRM/KMS) on tty1
After=network-online.target systemd-user-sessions.service user@__USER_UID__.service
Wants=network-online.target user@__USER_UID__.service

[Service]
User=__USER_NAME__
Environment=XDG_RUNTIME_DIR=/run/user/__USER_UID__

Environment=WPE_BACKEND_FDO_DRM_DEVICE=__DRM_DEV__
Environment=COG_PLATFORM_DRM_OUTPUT=__ACTIVE_OUT__

Environment=COG_PLATFORM_DRM_VIDEO_MODE=1920x1080
Environment=COG_PLATFORM_DRM_MODE_MAX=1920x1080@30
Environment=COG_PLATFORM_DRM_NO_CURSOR=1

ExecStartPre=/bin/sh -c 'for i in $(seq 1 150); do \
  ss -ltn | grep -q ":__PORT__ " && exit 0; \
  curl -fsS "http://127.0.0.1:__PORT__/health" >/dev/null 2>&1 && exit 0; \
  code=$(curl -fsSI -o /dev/null -w "%{http_code}" "http://127.0.0.1:__PORT__/" || true); \
  echo "$code" | grep -qE "^(200|30[0-9])$" && exit 0; \
  sleep 0.5; done; exit 1'

ExecStart=/usr/bin/cog --platform=drm --platform-params=renderer=gles "http://127.0.0.1:__PORT__/?kiosk=1"

TTYPath=/dev/tty1
TTYReset=yes
TTYVHangup=yes
StandardInput=tty
StandardOutput=null
StandardError=journal

Restart=always
RestartSec=2

[Install]
WantedBy=multi-user.target
UNIT

# Fyll inn plassholdere
sed -i \
  -e "s#__USER_NAME__#${USER_NAME}#g" \
  -e "s#__USER_UID__#${USER_UID}#g" \
  -e "s#__DRM_DEV__#${DRM_DEV}#g" \
  -e "s#__ACTIVE_OUT__#${ACTIVE_OUT}#g" \
  -e "s#__PORT__#${PORT}#g" \
  /etc/systemd/system/kiosk-cog.service

# Slå av getty og enable kiosk
systemctl disable --now getty@tty1.service || true
systemctl daemon-reload
systemctl enable --now kiosk-cog.service



### ─────────────────────────────────────────────────────────────────────────────
### 6) KMS/Firmware: tving 1080p30 + hotplug (idempotent)
### ─────────────────────────────────────────────────────────────────────────────
echo "==> Låser 1080p30 i kernel og sikrer HDMI-hotplug…"
CMDLINE="/boot/firmware/cmdline.txt"
CONF="/boot/firmware/config.txt"

# Rydd duplikater og sett consoleblank + video=<ACTIVE_OUT>:1080p30
sed -i -E 's/ *video=HDMI-A-[12]:[^ ]*//g; s/(^| )consoleblank=0//g; s/  +/ /g; s/ *$//' "$CMDLINE"
# legg til på slutten av linja
sed -i "1s/$/ consoleblank=0 video=${ACTIVE_OUT}:1920x1080@30/" "$CMDLINE"

# Legg (på nytt) et lite kiosk-blokk i config.txt (fjern tidligere blokk først)
sed -i '/^# Kiosk tweaks (autogenerert)$/,$d' "$CONF"
cat >> "$CONF" <<'EOF'

# Kiosk tweaks (autogenerert)
hdmi_force_hotplug=1
disable_overscan=1
hdmi_group=2
hdmi_mode=82   # 1080p30
hdmi_drive=2
EOF

echo "==> Ferdig! Anbefalt: sudo reboot"
