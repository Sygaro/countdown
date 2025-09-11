# Countdown – prosjektbeskrivelse og arkitektur

En robust, hodeløs "kiosk"-løsning for å vise en lokal Flask‑app (nedtelling) i fullskjerm på Raspberry Pi 4/5 – uten desktop‑miljø.

---

## Oversikt

- **Mål**: Vise en webbasert nedtelling i fullskjerm på en TV/HDMI‑skjerm, med automatisk oppstart ved boot og fjernadministrasjon over LAN.
- **Maskinvare/OS**: Raspberry Pi 4/5 · Raspberry Pi OS Lite (Debian Bookworm, aarch64)
- **Visningsmotor**: Cog (WPE WebKit) direkte på DRM/KMS (ingen X/Wayland)
- **Appserver**: Flask → Gunicorn på port **5000** (binder til `0.0.0.0` for LAN‑tilgang)
- **Init/Orkestrering**: systemd (én **user‑service** for appen + én **system‑service** for kiosken)
- **Repo**: `Sygaro/countdown`

---

## Hovedkomponenter

1. **Flask‑app (Countdown)**

   - Viser nedtelling/tekster, enkel admin‑side for å lagre meldinger og tidspunkt.
   - Endepunkter for health/konfig/start; klient oppdateres via SSE/polling.

2. **Gunicorn (user‑service)**

   - Kjører Flask som prosess under bruker (f.eks. `reidar`).
   - Lytter på `0.0.0.0:5000` slik at siden er tilgjengelig på LAN.

3. **Cog (system‑service)**

   - Starter nettleser i helskjerm på tty1, renderer rett på DRM/KMS.
   - Venter på at appen svarer før den prøver å laste URLen.

4. **setup\_kiosk.sh**

   - Installerer avhengigheter, lager venv, genererer systemd‑units, detekterer riktig DRM‑enhet/HDMI‑connector, og aktiverer autostart.

---

## Systemd‑tjenester

### 1) User‑service: `~/.config/systemd/user/countdown.service`

Viktige felter:

```ini
[Service]
WorkingDirectory=/home/<user>/countdown
Environment=PYTHONPATH=/home/<user>/countdown
Environment=PYTHONUNBUFFERED=1
ExecStart=/home/<user>/countdown/venv/bin/gunicorn wsgi:app \
  --bind 0.0.0.0:5000 --workers 2 --threads 4 --timeout 0 \
  --access-logfile - --error-logfile -
Restart=always
RestartSec=2
```

Oppstart ved boot uten pålogging:

```bash
loginctl enable-linger <user>
```

### 2) System‑service: `/etc/systemd/system/kiosk-cog.service`

Viktige felter og miljøvariabler:

```ini
[Service]
User=<user>
Environment=XDG_RUNTIME_DIR=/run/user/<uid>
Environment=WPE_BACKEND_FDO_DRM_DEVICE=/dev/dri/card1
Environment=COG_PLATFORM_DRM_OUTPUT=HDMI-A-1
Environment=COG_PLATFORM_DRM_VIDEO_MODE=1920x1080
Environment=COG_PLATFORM_DRM_MODE_MAX=1920x1080@60
Environment=COG_PLATFORM_DRM_NO_CURSOR=1

# Robust pre-wait: port eller /health eller / gir 200/30x
ExecStartPre=/bin/sh -c 'for i in $(seq 1 150); do \
  ss -ltn | grep -q ":5000 " && { echo ok; exit 0; }; \
  curl --connect-timeout 1 -fsS http://127.0.0.1:5000/health >/dev/null && { echo ok; exit 0; }; \
  code=$(curl --connect-timeout 1 -fsSI -o /dev/null -w "%{http_code}" http://127.0.0.1:5000/ || true); \
  echo "$code" | grep -qE "^(200|30[0-9])$" && { echo ok; exit 0; }; \
  sleep 0.5; done; echo timeout; exit 1'

ExecStart=/usr/bin/cog --platform=drm --platform-params=renderer=gles \
  "http://127.0.0.1:5000/?kiosk=1"

TTYPath=/dev/tty1
StandardOutput=journal
StandardError=journal
Restart=always
RestartSec=2
```

Valgfritt for renere logger:

```ini
Environment=NO_AT_BRIDGE=1
```

---

## Oppstartssekvens (forenklet)

1. **systemd** henter nettverk, starter **user\@UID** (linger aktivert).
2. **countdown.service** starter Gunicorn i `/home/<user>/countdown` og lytter på **:5000**.
3. **kiosk-cog.service** venter til appen svarer (port/health/200) og starter så Cog på tty1.
4. TV/HDMI viser appens URL i helskjerm.

---

## Endepunkter (eksempler)

- `GET /health` → 200 OK (brukes av kiosk‑precheck)
- `GET /api/config` → Leser konfig (JSON)
- `POST /api/config` → Lagrer konfig (f.eks. tekst, `daily_time`)
- `POST /api/start` → Start nedtelling nå (payload med minutter)

---

## Skjerm/HDMI‑tuning

- Primær kobling: `HDMI-A-1` på `/dev/dri/card1` (kan være `card0` i noen oppsett).
- Tving oppløsning via Cog‑env (`VIDEO_MODE`/`MODE_MAX`) og evt. kernel‑arg i `/boot/firmware/cmdline.txt`:
  - `video=HDMI-A-1:1920x1080@60`

---

## Feilsøking – nyttige kommandoer

```bash
# Appen (user-service)
systemctl --user status countdown.service -n 40
journalctl --user -u countdown.service -b -n 200 --no-pager

# Kiosk (system-service)
sudo systemctl status kiosk-cog.service -n 40
journalctl -u kiosk-cog.service -b -n 200 --no-pager

# Nett/health
ss -ltn | grep ':5000' || echo "no listen"
curl -sI http://127.0.0.1:5000/ | head -n1
curl -sI http://127.0.0.1:5000/health | head -n1 || echo "no /health"
```

---

## Sikkerhet og drift

- Ingen hemmeligheter i git: `.env` og `config.json` holdes utenfor repo.
- Bind mot `0.0.0.0` for LAN‑tilgang; vurder brannmur eller reverse proxy for WAN.
- systemd sørger for automatisk restart ved feil, og boot‑autostart via linger.

---

## Videre arbeid (idébank)

- Graceful fallback til sekundær URL hvis lokal app er nede.
- Watchdog som reloader Cog ved nettfeil.
- OTA‑oppdatering via git‑pull + systemd‑restarts.
- Enklere administrasjon av tidsskjema (cron‑lignende UI) og varselgrenser.

