# Countdown (RPi · Flask/Gunicorn · systemd)

En enkel, driftssikker visningsapp for Raspberry Pi i kiosk-modus.  
Modi: **daily**, **once**, **duration**, **clock**.  
Konfig lagres atomisk i `config.json`. Admin-endringer slår inn i visningen uten refresh.

---

## Innhold

- [Funksjoner](#funksjoner)
- [Mappestruktur](#mappestruktur)
- [Krav](#krav)
- [Kom i gang (lokalt)](#kom-i-gang-lokalt)
- [Produksjon (RPi)](#produksjon-rpi)
- [API](#api)
- [Konfig (utdrag)](#konfig-utdrag)
- [Utvikling](#utvikling)
- [Driftstips](#driftstips)
- [Lisens](#lisens)

---

## Funksjoner

- **Modi**
  - `daily` – visning teller ned mot valgt tid hver dag (f.eks. 23:00)
  - `once` – engangs tidspunkt (ISO, f.eks. `2025-09-13T19:30+02:00`)
  - `duration` – start nedtelling på X minutter fra nå
  - `clock` – stor klokke (HH:MM / HH:MM:SS)
- **Tema & bakgrunn**
  - Farger og størrelser for tall og meldinger
  - Bakgrunn: solid, gradient eller bilde (med tint/opacity)
- **Meldinger**
  - Primær og sekundær melding i nedtelling
  - Valgfri **egen melding i klokkemodus** (posisjon: høyre/venstre/over/under, egen justering)
- **Live-oppdatering**
  - Admin-endringer oppdaterer visningen uten reload (bakgrunn, farger, meldinger mm.)
- **Kiosk-vennlig**
  - Fullskjerm-knapp skjules automatisk i fullscreen og vises ikke ved musebevegelse
- **Robust lagring**
  - Atomisk skriving av `config.json` (fsync + `os.replace`)

---

## Mappestruktur


```bash
countdown/
├─ app/
│ ├─ init.py # create_app + blueprint-registrering
│ ├─ routes/ # pages, admin, api, public, diag
│ ├─ countdown.py # kjernelogikk/tick
│ ├─ storage.py # lasting/validering/skriving av config (atomisk)
│ ├─ settings.py # miljø/paths/tz
│ └─ models.py # (ev. simple typer/DTO-er)
├─ static/
│ ├─ index.html # visning
│ ├─ admin.html # adminpanel
│ ├─ diag.html # diagnose
│ ├─ about.html # om-siden
│ ├─ css/ # ui.css / style.css
│ └─ js/ # (valgfritt) util/theme-moduler om du ønsker
├─ wsgi.py # gunicorn entry
├─ requirements.txt
└─ config.json # runtime-konfig (genereres automatisk ved første start)
```


---

## Krav

- Python **3.10+**
- Linux (RPi OS anbefalt)
- `systemd` (bruker-tjeneste)
- Kiosk-nettleser: **WPE/Cog** eller **Chromium** i kiosk-modus

---

## Kom i gang (lokalt)

```bash
git clone https://github.com/<org>/<repo>.git
cd countdown
python3 -m venv venv
. venv/bin/activate
pip install -r requirements.txt

# dev-kjøring
FLASK_APP=wsgi.py FLASK_ENV=development python wsgi.py
# åpne http://127.0.0.1:5000
```
## Produksjon (RPi)

#### 1. Installer avhengigheter
sudo apt update
sudo apt install -y python3-venv
python3 -m venv venv
. venv/bin/activate
pip install -r requirements.txt

### 2. systemd (brukertjeneste)
```console
~/.config/systemd/user/countdown.service
```
```ini
[Unit]
Description=Countdown (Flask/Gunicorn)
After=network-online.target

[Service]
WorkingDirectory=%h/countdown
ExecStart=%h/countdown/venv/bin/gunicorn -w 2 -b 127.0.0.1:5000 wsgi:app
Restart=on-failure
Environment=PYTHONUNBUFFERED=1

[Install]
WantedBy=default.target

```
Aktiver:
```bash
systemctl --user daemon-reload
systemctl --user enable --now countdown.service
systemctl --user status countdown.service
```

### 3. Kiosk-nettleser

WPE/Cog: `cog http://localhost:5000/ --platform=wl`

Chromium: `chromium --kiosk --app=http://localhost:5000/ --noerrdialogs --disable-session-crashed-bubble`

---
## API

| Metode | Sti                   | Beskrivelse                             |
| -----: | --------------------- | --------------------------------------- |
|    GET | `/`                   | Visning                                 |
|    GET | `/admin`              | Admin                                   |
|    GET | `/diag`               | Diagnose                                |
|    GET | `/about`              | Om                                      |
|    GET | `/api/config`         | Hent `{ ok, config, tick }`             |
|   POST | `/api/config`         | Lagre/patch konfig (inkl. bytte `mode`) |
|   POST | `/api/start-duration` | Start varighetsmodus: `{"minutes": N}`  |
|    GET | `/tick`               | Status for visning/diagnose             |
|    GET | `/health`             | 200 OK (helse-sjekk)                    |


Admin-passord (valgfritt): hvis satt, sendes i header `X-Admin-Password`.

---

### Konfig (utdrag)

```json
{
  "mode": "daily|once|duration|clock",
  "daily_time": "HH:MM",
  "once_at": "YYYY-MM-DDTHH:MM(+TZ)",
  "duration_minutes": 10,

  "clock": {
    "with_seconds": false,
    "color": "#e6edf3",
    "size_vmin": 12,
    "position": "center|top-left|top-center|top-right|bottom-left|bottom-center|bottom-right",
    "messages_position": "right|left|above|below",
    "messages_align": "start|center|end",
    "use_clock_messages": false,
    "message_primary": "",
    "message_secondary": ""
  },

  "theme": {
    "digits":   { "size_vw": 14 },
    "messages": {
      "primary":   { "size_rem": 1.0, "weight": 600, "color": "#9aa4b2" },
      "secondary": { "size_rem": 1.0, "weight": 400, "color": "#9aa4b2" }
    },
    "background": {
      "mode": "solid|gradient|image",
      "solid":    { "color": "#0b0f14" },
      "gradient": { "from": "#142033", "to": "#0b0f14", "angle_deg": 180 },
      "image":    {
        "url": "", "fit": "cover|contain", "opacity": 1,
        "tint": { "color": "#000000", "opacity": 0.0 }
      }
    }
  }
}

```

## Utvikling
- Kjør lokalt

```bash
. venv/bin/activate
FLASK_APP=wsgi.py FLASK_ENV=development python wsgi.py
```


- Lint/format (anbefalt)

pip install -r requirements-dev.txt  # hvis du bruker egen dev-fil
ruff check app
black app static


- Enkel røyk-test (CI/Action)

curl -sf http://127.0.0.1:5000/health


- Editor

.editorconfig for consistent LF/UTF-8

Pre-commit hooks: ruff/black/prettier

---

### Driftstips

- `config.json` skrives atomisk (tempfil + `os.replace()`).
-Endringer i admin pushes live til visningen (periodisk polling av `/api/config`).
-Fullskjerm-knappen skjules i fullscreen og vises ikke ved musebevegelse.
-Logg:
`journalctl --user -u countdown.service -b -n 200 --no-pager`
