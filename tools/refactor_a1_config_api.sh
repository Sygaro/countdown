#!/usr/bin/env bash
#
# tools/refactor_a1_config_api.sh
#
# A1: Tving alle config-kall til å gå via app/storage/api.py
# - erstatt imports fra storage.config / storage.io
# - oppdater funksjonskall til get_config / patch_config / replace_config
#
# Kjør fra prosjektroten (mappen som inneholder app/).
# Avhenger av: bash, perl, git (valgfritt, men anbefalt)
#
set -euo pipefail

PROJECT_ROOT="$(pwd)"
if [[ ! -d "app" ]]; then
  echo "ERROR: Kjør skriptet fra prosjektroten (må finnes en 'app' katalog)." >&2
  exit 1
fi

# Sjekk git repo
if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  GIT=1
  BRANCH="refactor/a1-config-facade-$(date +%Y%m%d-%H%M%S)"
  echo "==> Oppretter git-branch: ${BRANCH}"
  git checkout -b "$BRANCH"
else
  GIT=0
  echo "==> Ikke et git-repo; fortsetter uten git."
fi

# Finn alle pythonfiler vi skal endre (ekskluder kjernemodulene)
readarray -t PYFILES < <(find app -type f -name '*.py' \
  ! -path 'app/storage/api.py' \
  ! -path 'app/storage/io.py' \
  -print | sort)

echo "==> Filer som oppdateres: ${#PYFILES[@]} stk"

# 1) Erstatt imports fra storage.config og storage.io med app.storage.api
#    Vi gjør bytte linje-for-linje for å unngå å måtte finne riktig importposisjon selv.
#    Duplicates ryddes i neste steg.
for f in "${PYFILES[@]}"; do
  perl -0777 -i -pe '
    # Normaliser ulike relative/absolute importvarianter til én linje
    s/^[ \t]*from[ \t]+(\.\.|app|\.)?storage\.config[ \t]+import[ \t]+.*$/from app.storage.api import get_config, patch_config, replace_config/mg;
    s/^[ \t]*from[ \t]+(\.\.|app|\.)?storage\.io[ \t]+import[ \t]+.*$/from app.storage.api import get_config, patch_config, replace_config/mg;
  ' "$f"
done

# 2) Oppdater funksjonskall
for f in "${PYFILES[@]}"; do
  perl -0777 -i -pe '
    # NB: begrens til "vanlige" kall; endrer ikke alias som "lc(...)" osv.
    s/\bload_config\s*\(/get_config(/g;
    s/\bsave_config_patch\s*\(/patch_config(/g;
    s/\bsave_config\s*\(/replace_config(/g;
  ' "$f"
done

# 3) Ryggdekning: fjern dublette identiske importlinjer
for f in "${PYFILES[@]}"; do
  # Fjern duplikate identiske linjer av akkurat denne importen
  awk '
    BEGIN { seen=0 }
    {
      if ($0 ~ /^from app\.storage\.api import get_config, patch_config, replace_config$/) {
        if (seen==1) next; else { seen=1 }
      }
      print
    }
  ' "$f" > "$f.__tmp__"
  mv "$f.__tmp__" "$f"
done

# 4) Oppsummering/diff
if [[ "$GIT" == "1" ]]; then
  echo "==> Git diff (kort):"
  git status -s
  git --no-pager diff --stat || true
  echo
  echo "Tips: Se full diff med: git --no-pager diff"
else
  echo "==> Endringer gjort uten git. Vurder å ta en backup/patch med 'diff -ruN'."
fi

echo "==> A1 ferdig. Kjør nå testene under."

cat <<'EOF'

Verifisering (A1):
------------------
# 1) Ingen rester av gamle imports:
grep -RIn --line-number --color \
  -e 'from ..storage.config' \
  -e 'from app\.storage\.config' \
  -e 'from \.storage\.config' \
  -e 'from ..storage.io' \
  -e 'from app\.storage\.io' \
  -e 'from \.storage\.io' \
  app | sed -E 's/^/SHOULD-NOT-EXIST: /'

# Forventet: ingen linjer.

# 2) Enkel syntaks-sjekk (valgfritt):
python -m py_compile $(find app -type f -name '*.py')

# 3) Start tjenesten og test API:
#    Bruk localhost eller 10.20.0.144 avhengig av hvor du kjører fra.
curl -s http://localhost:5000/api/config | jq '.ok, .__config_path, .config._meta'
curl -s -X PATCH http://localhost:5000/api/config \
  -H 'Content-Type: application/json' \
  -d '{"message_primary":"A1-test"}' | jq '.ok, .config.message_primary'
curl -s http://localhost:5000/api/config | jq '.config.message_primary'

EOF
