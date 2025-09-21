# Countdown

En liten, robust visningsapp for nedtelling (og klokke) – laget for Raspberry Pi i kiosk‑modus, men kan også kjøres lokalt på en vanlig PC.

## Hensikt

- Vise tidsnedtelling mot et mål (daglig, engangs, eller i et gitt antall minutter)
- Vise klokke med valgfri primær/sekundærtekst
- Konfigurasjon via enkel adminside, lagring i `config.json`
- Trygg drift på RPi i kiosk (WPE/Cog på DRM/KMS)

## Viktige funksjoner

- **Modi:** `daily`, `once`, `duration`, `clock`
- **Tema:** bakgrunn (solid/gradient/bilde m/ tint eller dynamisk), farger, typografi, meldinger
- **Overlays:** plasserbare logoer/grafikk med synlighetsregler (clock vs countdown)
- **Live‑oppdatering:** visningen henter status fra `/tick` og endrer seg uten refresh
- **Diagnose:** `/diag` viser live‑data, egen selvtest og nyttige debug‑endepunkter

## Plattform

- Raspberry Pi OS Lite (Bookworm, 64‑bit). Kiosk via **Cog** (WPE WebKit) på DRM/KMS.
- Python 3.11+, Flask + Gunicorn som **user‑service** i systemd.
- Fungerer også i en «vanlig» nettleser (uten kiosk‑delen).

---

## Installasjon (RPi / kiosk)

> Kortversjonen: legg koden i `~/countdown` og kjør setup‑scriptet som root.

```bash
# Logg inn som vanlig bruker og hent repoet
cd ~
git clone https://github.com/Sygaro/countdown

# Kjør oppsettet (som root/sudo)
sudo bash countdown/setup/setup_kiosk.sh
```

Scriptet gjør bl.a. dette:

- Installerer systempakker (cog, wpewebkit, python venv, mm.)
- Setter opp venv + `pip install -r requirements.txt`
- Oppretter systemd **user‑service** `countdown.service` (Gunicorn)
- Oppretter systemd **kiosk‑service** `kiosk-cog.service` (DRM på tty1)
- Slår på NTP og (hvis tilgjengelig) `systemd-time-wait-sync` slik at appen starter etter tidssynk
- Låser skjermutgang til 1080p30 og aktiverer HDMI‑hotplug

> **Etter kjøring:** `sudo reboot` anbefales.

### Variabler

- `APP_DIR` (default: `~/countdown`)
- `VENVDIR` (default: `~/countdown/venv`)
- `PORT` (default: `5000`)
- `USER_NAME` (brukeren som skal eie/drive tjenestene)

Eksempel:

```bash
sudo APP_DIR=/home/pi/countdown PORT=5000 bash setup/setup_kiosk.sh
```

---

## Kjøring lokalt (uten kiosk)

```bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
export FLASK_APP=wsgi:app
flask run --debug
# Åpne http://127.0.0.1:5000
```

---

## Tjenester

- **App:** `systemctl --user status countdown.service`
- **Kiosk (DRM):** `sudo systemctl status kiosk-cog.service`

Vanlige operasjoner:

```bash
# Som bruker (for appen):
systemctl --user restart countdown.service

# Som root (for kiosk):
sudo systemctl restart kiosk-cog.service
```

---

## Konfigurasjon

- Fil: `config.json` i prosjektroten
- API: `GET /api/config` og `POST /api/config`
- Admin‑UI lagrer delvise endringer atomisk og sender bare diff

Overlays styres pr. element:

```json
{
  "type": "image",
  "url": "/static/logo.png",
  "visible_in": ["clock"],
  "position": "top-right",
  "size_vmin": 12
}
```

> Tom liste `"visible_in": []` betyr **vis aldri**.

---

## Tid & robusthet

- Appen bruker server‑tid fra `/tick` og jevner ut smådrift (slew) i klienten.
- Oppsettet venter på NTP‑synk via `time-sync.target` (og en ekstra «belt & suspenders»‑sjekk i systemd‑unit).

---

## Sikkerhet

- Enkle admin‑kall bruker headeren `X-Admin-Password`. Sett passordet i admin‑UI.
- For maskinkontroll (restart/reboot/shutdown) anbefales en begrenset sudoers‑regel (se forslag i issues/PR mal under).

---

## Utvikling

- Backend: se `app/routes/*` (blueprints) og `wsgi.py`
- Frontend: `static/` (HTML/JS/CSS). Visning i `static/index.html`.
- Tester: enkel «selvtest» eksponert via `/debug/selftest`.

### Branch & deploy

```bash
git checkout -b feature/xyz
# … gjør endringer …
git commit -m "feat: xyz"
git push -u origin feature/xyz
# PR / merge → main
```

---

## Feilsøking

- `journalctl --user -u countdown -f`
- `sudo journalctl -u kiosk-cog -f`
- `/diag` viser live `/tick` og latency, `/debug/selftest` kjører sanity‑checks


