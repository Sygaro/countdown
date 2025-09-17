# README\_DEV.md

> Prosjekt: **Countdown** (RPi • Flask/gunicorn • systemd)

Denne veilederen beskriver hvordan vi jobber, kvalitetskrav, branching, DoD og release/rollback. Målet er produksjonsklar, robust kode – små, trygge inkrementer som er enkle å rulle tilbake.

---

## Kvalitetskrav

- Lesbarhet & struktur: klar navngivning, små funksjoner, ingen duplisering. Kommentarer forklarer hvorfor, ikke hva.

- Stabilitet: defensiv koding; tåler manglende felter/eldre config; bakoverkomp med alias + Deprecation/Sunset-headere ved behov.

- Feilhåndtering: meningsfulle feilmeldinger, ingen stille feilsvelging på kritiske kall.

- Ytelse: UI oppdaterer effektivt (kontrollert tick), ingen unødvendige reflow/interval-lekkasjer.

- Sikkerhet: X-Admin-Password respekteres der det er aktuelt; ingen logging av hemmeligheter.

- Konsistens: mørkt tema; mobilvennlig; samme stil på alle sider.
---

## 1) Mål & kilde til sannhet

- **Mål:** Robust funksjonalitet uten snarveier. Små, avgrensede endringer.
- **Kilde til sannhet:** Repo + **gjeldende branch/tag** som du oppgir. Jeg **leser hele filene** du sender/peker på (ikke utdrag) før endringer. Endrer minst mulig uten eksplisitt avtale.

---

## 2) Miljø

- **Runtime:** Raspberry Pi, systemd user service (`~/.config/systemd/user/countdown.service`), gunicorn via `wsgi.py`.
- **App:** Flask blueprints (`/`, `/admin`, `/diag`, `/about`, `/api/*`), statiske filer i `static/`.
- **Config:** JSON (`config.json`) på prosjektrot. Endringer skal være additive/kompatible. Migreringer er idempotente (setter `_migrated_at`).

---

## 3) Arbeidsflyt per endring

1. **Branch** fra avtalt base (f.eks. `stable/YYYY-MM-DD` eller spesifikk commit):
   ```bash
   git checkout -b feat/<kort-beskrivelse>
   ```
2. **Analyse:** Les hele relevante filer (frontend + backend). Kartlegg ruter/kontrakt.
3. **Plan:** Kort, punktvis plan + akseptansekriterier (DoD) i chat.
4. **Implementasjon:** Minst mulig diff. Bevar eksisterende mønstre. Ingen API-brudd uten alias/deprecation.
5. **Testing:** Manuell verifikasjon + små `curl`/Postman-snutter (leveres sammen med PR).
6. **Dok:** Kort PR-tekst + ev. Om/diag-oppdatering.
7. **Deploy:** Du tester på RPi. Hvis OK: merge til `main` (eller ny `stable/*`) og tag.
8. **Rollback-klar:** Alltid lett å rulle tilbake (branch/tag). Ingen force-push til `main`.

---

## 4) Branching & versjonering

- **Feature:** `feat/<emne>`
- **Bugfix:** `fix/<emne>`
- **Hotfix:** `hotfix/<emne>`
- **Stabil:** `stable/YYYY-MM-DD` (langlivet fallback)
- **Tag:** Annotert: `v<semver>-stable-YYYY-MM-DD`

**Rulle tilbake (RPi):**

```bash
cd ~/countdown
git fetch --all --prune
# til stabil branch
git checkout stable/YYYY-MM-DD && git reset --hard origin/stable/YYYY-MM-DD
systemctl --user restart countdown
```

---

## 5) Kodekvalitet & stil

- **Python:** PEP 8, type hints der det gir verdi, korte funksjoner, meningsfulle navn.
- **JS/HTML/CSS:** Lesbar, modulær JS; semantisk HTML; CSS i `static/css/ui.css`.
- **Kommentarer:** Forklar **hvorfor**, ikke *hva*.
- **Sikkerhet:** Respekter `X-Admin-Password` der relevant; ikke logg hemmeligheter.
- **Ytelse:** Kontrollerte intervaller (polling), rydd opp timere, unngå reflow-stormer.

---

## 6) API-kontrakter

- Kanoniske ruter dokumenteres. Endringer **introduceres med alias** og Deprecation/Sunset-headere før gamle ruter fases ut.
- `/tick` svarer alltid (uansett modus) med feltene visningen forventer.
- Dokumenter nye felter i `config.json` og gi trygg default.

**Eksempel (start varighet):**

```bash
curl -sX POST http://<host>:5000/api/start-duration \
  -H "Content-Type: application/json" -d '{"minutes":3}' | jq
```

---

## 7) Test & verifikasjon (mal)

**Sanity:**

```bash
curl -s http://<host>:5000/api/config | jq .
curl -s http://<host>:5000/tick | jq .
```

**Varighet:**

```bash
curl -sX POST http://<host>:5000/api/start-duration -H "Content-Type: application/json" -d '{"minutes":2}' | jq '.ok,.config.mode,.tick.signed_display_ms'
```

**Stopp-skjerm (hvis egen rute):**

```bash
curl -sX POST http://<host>:5000/api/mode -H 'Content-Type: application/json' -d '{"mode":"screen"}'
```

---

## 8) Release & rollback

1. Merge til `main` eller opprett `stable/<dato>`.
2. Tagg annotert:
   ```bash
   git tag -a vX.Y.Z-stable-YYYY-MM-DD -m "Stable fallback"
   git push origin vX.Y.Z-stable-YYYY-MM-DD
   ```
3. **GitHub Release:** kort tekst m. endringer, testoppskrift, rollback.

---

## 9) Definition of Done (DoD)

**Endringen skal ikke merges før alle punkter er grønne.**

 - Endringen er implementert i avtalte filer, uten sideeffekter.
 - Alle berørte ruter fungerer (/api/config, /tick, relevante POST-ruter).
 - Frontend oppdaterer riktig (visuelt verifisert).
 - Kort testoppskrift (curl/Postman) levert og grønn.
 - PR-tekst + kort changelog skrevet.
 - Rollback-sti klar (branch/tag).

---

## 10) Konvensjoner (commit & PR)

**Commit-mønster**

- `feat: …` – ny funksjon
- `fix: …` – feilfiks
- `chore: …` – rydding/devops/ikke-funksjonelt
- `docs: …` – dokumentasjon
- `refactor: …` – intern omstrukturering uten funksjonsendring

**PR-praksis**

- Én PR = én endring.
- Beskriv *hva* og *hvorfor*, ikke bare *hvordan*.
- Link til issue/oppgave om relevant.
- Legg ved korte test-snutter og skjermbilder når UI endres.

---

## 11) Spesifikke prosjektregler (UI)

- **Fullskjerm-knapp**: vises kun når *ikke* `?kiosk=1` og *ikke* i fullscreen; ingen "vekking" på musebevegelse.
- **Digits**: Tabulære tall (lik bredde) og gode fallback-fonter. Størrelse skaleres med `vmin` og nedskaleres for `H:MM:SS` over terskel.
- **Stopp-skjerm**: Bakgrunnspresets, egendefinert tekst/bilde, klokke-overlay med posisjoner (hjørner, top/bottom, center). Klokke-størrelse og -sekunder konfigurerbare.
- **Diag**: Debug-output overskrives ikke av polling; vis både `MM:SS` og `H:MM:SS`.

---

# .github/pull\_request\_template.md

## Sammendrag

Kort beskrivelse av hva som er endret og hvorfor.

## Type endring

-

## Endringer (punktvis)

- …

## Skjermbilder / GIF (valgfritt)

(Legg ved ved UI-endringer.)

## API/konfig-endringer

-

## Risiko & rollback

- Påvirker: [frontend | backend | begge]
- Rollback-kommandoer:
  ```bash
  git checkout stable/YYYY-MM-DD && git reset --hard origin/stable/YYYY-MM-DD
  systemctl --user restart countdown
  ```

## Test (manuell/CLI)

-

**CLI-snutter**

```bash
curl -s http://<host>:5000/api/config | jq .
curl -s http://<host>:5000/tick | jq .
curl -sX POST http://<host>:5000/api/start-duration \
  -H 'Content-Type: application/json' -d '{"minutes":2}' | jq .
```

## Sikkerhet & ytelse

-

## Dokumentasjon

-

## Sjekkliste (DoD)

Bekreft at alle punkter i **README\_DEV §9** er oppfylt.

