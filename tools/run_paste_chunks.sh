#!/usr/bin/env sh
# tools/run_paste_chunks.sh
# Wrapper for tools/make_paste_chunks.py – uten globbing og med .pastechunksrc-støtte.

set -e

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
REPO_DIR="$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)"

PYTHON_BIN="${PYTHON_BIN:-$(command -v python3)}"
SCRIPT_PATH="${SCRIPT_PATH:-$REPO_DIR/tools/make_paste_chunks.py}"

ROOT_DIR="${ROOT_DIR:-$REPO_DIR}"
OUT_DIR="${OUT_DIR:-$REPO_DIR/paste_out}"
MAX_LINES="${MAX_LINES:-4000}"
ALLOW_BINARY="${ALLOW_BINARY:-0}"

CFG_MAIN="$REPO_DIR/.pastechunksrc"
CFG_LOCAL="$REPO_DIR/.pastechunksrc.local"

# last config (valgfritt)
[ -f "$CFG_MAIN" ] && . "$CFG_MAIN"
[ -f "$CFG_LOCAL" ] && . "$CFG_LOCAL"

# multiline støttes – eks: INCLUDES=$'app/**/*.py\nstatic/**/*.{js,css,html}\ntools/**/*.py'
INCLUDE_LIST="${INCLUDES:-$INCLUDE_LIST}"
EXCLUDE_LIST="${EXCLUDES:-$EXCLUDE_LIST}"

# CLI overstyringer
PASSTHRU=""
while [ $# -gt 0 ]; do
  case "$1" in
    -r|--root)       ROOT_DIR="$2"; shift 2 ;;
    -o|--out)        OUT_DIR="$2"; shift 2 ;;
    -n|--max-lines)  MAX_LINES="$2"; shift 2 ;;
    --allow-binary)  ALLOW_BINARY=1; shift ;;
    --include)       INCLUDE_LIST="${INCLUDE_LIST}
$2"; shift 2 ;;
    --exclude)       EXCLUDE_LIST="${EXCLUDE_LIST}
$2"; shift 2 ;;
    --python)        PYTHON_BIN="$2"; shift 2 ;;
    --script)        SCRIPT_PATH="$2"; shift 2 ;;
    --)              shift; PASSTHRU="$*"; break ;;
    *)               PASSTHRU="$PASSTHRU $1"; shift ;;
  esac
done

# miljøsjekk
command -v "$PYTHON_BIN" >/dev/null 2>&1 || { echo "Finner ikke python: $PYTHON_BIN" >&2; exit 1; }
[ -f "$SCRIPT_PATH" ] || { echo "Finner ikke skript: $SCRIPT_PATH" >&2; exit 1; }
[ -d "$ROOT_DIR" ]   || { echo "ROOT_DIR finnes ikke: $ROOT_DIR" >&2; exit 1; }
mkdir -p "$OUT_DIR"

# bygg argv uten globbing
set -f  # slå av pathname expansion

# start med basis-args
set -- --root "$ROOT_DIR" --out "$OUT_DIR" --max-lines "$MAX_LINES"

# legg til includes
OLDIFS=$IFS
IFS='
'
for line in $INCLUDE_LIST; do
  case "$line" in ""|\#*) continue ;; esac
  set -- "$@" --include "$line"
done

# legg til excludes
for line in $EXCLUDE_LIST; do
  case "$line" in ""|\#*) continue ;; esac
  set -- "$@" --exclude "$line"
done
IFS=$OLDIFS

[ "$ALLOW_BINARY" = "1" ] && set -- "$@" --allow-binary

# passthrough (f.eks. --list-only)
for tok in $PASSTHRU; do
  set -- "$@" "$tok"
done

# vis og kjør
printf '▶ %s %s' "$PYTHON_BIN" "$SCRIPT_PATH"
for a in "$@"; do printf ' %s' "$a"; done; printf '\n'
exec "$PYTHON_BIN" "$SCRIPT_PATH" "$@"
