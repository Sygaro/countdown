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

# Sett lokal NTP-server for systemd-timesyncd via drop-in
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
Environment=COUNTDOWN_VERSION=1.0.0
Environment=COUNTDOWN_COMMIT=%h
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
Description=Kiosk (Cog on DRM/KMS) on tty1
Wants=network-online.target user@__USER_UID__.service
After=network-online.target user@__USER_UID__.service
ConditionPathExists=/dev/tty1

[Service]
User=__USER_NAME__
Environment=XDG_RUNTIME_DIR=/run/user/__USER_UID__
Environment=HOME=__USER_HOME__
WorkingDirectory=__APP_DIR__

Environment=WPE_BACKEND_FDO_DRM_DEVICE=__DRM_DEV__
Environment=COG_PLATFORM_DRM_OUTPUT=__ACTIVE_OUT__
Environment=COG_PLATFORM_DRM_VIDEO_MODE=1920x1080
Environment=COG_PLATFORM_DRM_MODE_MAX=1920x1080@30
Environment=COG_PLATFORM_DRM_NO_CURSOR=1
Environment=COG_PLATFORM_DRM_DISABLE_MODIFIERS=1

ExecStartPre=/bin/sh -c '\
  for i in $(seq 1 40); do \
    test -d "/run/user/__USER_UID__" && break; sleep 0.25; done; \
  for i in $(seq 1 40); do \
    test -S "/run/user/__USER_UID__/systemd/private" && break; sleep 0.25; done; \
  for i in $(seq 1 150); do \
    ss -ltn | grep -q ":__PORT__ " && exit 0; \
    curl -fsS "http://127.0.0.1:__PORT__/health" >/dev/null 2>&1 && exit 0; \
    code=$(curl -fsSI -o /dev/null -w "%{http_code}" "http://127.0.0.1:__PORT__/" || true); \
    echo "$code" | grep -qE "^(200|30[0-9])$" && exit 0; \
    sleep 0.5; \
  done; \
  echo "Flask/Gunicorn svarte ikke i tide"; exit 1'

ExecStart=/usr/bin/cog --platform=drm --platform-params=renderer=gles "http://127.0.0.1:__PORT__/?kiosk=1"

TTYPath=/dev/tty1
TTYReset=yes
TTYVHangup=yes
StandardInput=tty
StandardOutput=null
StandardError=journal

Restart=always
RestartSec=2
TimeoutStopSec=10
KillMode=process

[Install]
WantedBy=multi-user.target
UNIT

# Fyll inn plassholdere
sed -i \
  -e "s#__USER_NAME__#${USER_NAME}#g" \
  -e "s#__USER_UID__#${USER_UID}#g" \
  -e "s#__USER_HOME__#${USER_HOME}#g" \
  -e "s#__APP_DIR__#${APP_DIR}#g" \
  -e "s#__DRM_DEV__#${DRM_DEV}#g" \
  -e "s#__ACTIVE_OUT__#${ACTIVE_OUT}#g" \
  -e "s#__PORT__#${PORT}#g" \
  /etc/systemd/system/kiosk-cog.service

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

### ─────────────────────────────────────────────────────────────────────────────
### X) Root-helpers for diag + smal sudoers (NOPASSWD kun for disse)
###     - cdown-restart   -> restart countdown.service (user-scope)
###     - cdown-reboot    -> system reboot (system-scope)
###     - cdown-shutdown  -> system poweroff (system-scope)
### Idempotent.
### ─────────────────────────────────────────────────────────────────────────────
echo "==> Installerer countdown root-helpers + sudoers…"

# Helper: restart app (USER-SCOPE via --user)
install -m 0755 -o root -g root /dev/stdin /usr/local/sbin/cdown-restart <<'SH'
#!/bin/sh
set -eu
APP_USER="__APP_USER__"
APP_UID="__APP_UID__"
export XDG_RUNTIME_DIR="/run/user/${APP_UID}"
if RUNUSER="$(command -v runuser 2>/dev/null)"; then
  exec "$RUNUSER" -u "$APP_USER" -- systemctl --user restart --no-block --quiet --fail countdown.service
else
  exec su -s /bin/sh - "$APP_USER" -c "XDG_RUNTIME_DIR=$XDG_RUNTIME_DIR systemctl --user restart --no-block --quiet --fail countdown.service"
fi
SH
sed -i -e "s#__APP_USER__#${USER_NAME}#g" -e "s#__APP_UID__#${USER_UID}#g" /usr/local/sbin/cdown-restart

# Helper: reboot (SYSTEM-SCOPE)
install -m 0755 -o root -g root /dev/stdin /usr/local/sbin/cdown-reboot <<'SH'
#!/bin/sh
exec /usr/sbin/reboot
SH

# Helper: shutdown (SYSTEM-SCOPE)
install -m 0755 -o root -g root /dev/stdin /usr/local/sbin/cdown-shutdown <<'SH'
#!/bin/sh
exec /usr/sbin/poweroff
SH

# Sudoers-regel – NOPASSWD kun for de tre helperne over
TMP_SUDOERS="$(mktemp)"
cat > "${TMP_SUDOERS}" <<EOF
# Countdown kiosk: tillat begrensede handlinger uten passord
${USER_NAME} ALL=(root) NOPASSWD: /usr/local/sbin/cdown-restart, /usr/local/sbin/cdown-reboot, /usr/local/sbin/cdown-shutdown
EOF
visudo -c -f "${TMP_SUDOERS}" >/dev/null 2>&1 && \
  install -m 0440 -o root -g root "${TMP_SUDOERS}" /etc/sudoers.d/countdown || \
  { echo "FEIL: sudoers-validering feilet – endrer ingenting."; rm -f "${TMP_SUDOERS}"; exit 1; }
rm -f "${TMP_SUDOERS}"

# Non-invasive sanity check
if sudo -u "${USER_NAME}" -n /usr/local/sbin/cdown-restart >/dev/null 2>&1; then
  echo "   → sudoers + user-restart OK."
else
  echo "   → OBS: restart via user-service feiler. Sjekk /etc/sudoers.d/countdown og user@UID."
fi




echo "==> Ferdig! Anbefalt: sudo reboot"
