#!/usr/bin/env bash
# bin/diag.sh
# Enkel diagnostikk av Countdown API og config-IO uten jq.
# Bruk:  bin/diag.sh [BASE_URL]   # default http://127.0.0.1:5000

set -u

BASE_URL="${1:-http://127.0.0.1:5000}"

c_green() { printf "\033[32m%s\033[0m\n" "$*"; }
c_yellow(){ printf "\033[33m%s\033[0m\n" "$*"; }
c_red()   { printf "\033[31m%s\033[0m\n" "$*"; }
hr()      { printf -- "------------------------------\n"; }

curl_json() {
  curl -sS -H 'Accept: application/json' "$1"
}

pp() {
  # Pretty print JSON med Python
  python3 -m json.tool 2>/dev/null || cat
}

jget() {
  # Plukk felt fra JSON stdin: jget key1 key2 ...
  python3 - "$@" <<'PY'
import sys, json
keys = sys.argv[1:]
try:
    j = json.load(sys.stdin)
except Exception as e:
    print(f"ERR parse JSON: {e}")
    sys.exit(1)
for k in keys:
    v = j
    for part in k.split('.'):
        v = v.get(part) if isinstance(v, dict) else None
    print(f"{k}: {v}")
PY
}

passfail() {
  if [ "$1" = "ok" ]; then c_green "OK  - $2"
  else c_red "FAIL- $2"; fi
}

echo "Countdown diag  |  BASE_URL=$BASE_URL"
hr

echo "[1] Whoami"
W=$(curl_json "$BASE_URL/debug/whoami")
echo "$W" | pp
USER_R=$(echo "$W" | jget user | sed -n 's/^user: //p')
CFG_R=$(echo "$W" | jget config_path | sed -n 's/^config_path: //p')
[ -n "$USER_R" ] && passfail ok "runtime user: $USER_R" || passfail fail "whoami user"
[ -n "$CFG_R" ] && passfail ok "config_path: $CFG_R" || passfail fail "config_path"

hr
echo "[2] Debug config (read & perms)"
D=$(curl_json "$BASE_URL/debug/config")
echo "$D" | pp
CAN_RD=$(echo "$D" | jget can_read   | sed -n 's/^can_read: //p')
CAN_WD=$(echo "$D" | jget can_write_dir | sed -n 's/^can_write_dir: //p')
PATH_C=$(echo "$D" | jget path | sed -n 's/^path: //p')
[ "$CAN_RD" = "True" ] && passfail ok "can_read $PATH_C" || passfail fail "cannot read $PATH_C"
[ "$CAN_WD" = "True" ] && passfail ok "dir writable $(dirname "$PATH_C")" || passfail fail "dir not writable $(dirname "$PATH_C")"

hr
echo "[3] Skrivetest"
DW=$(curl_json "$BASE_URL/debug/config?write_test=1")
echo "$DW" | pp
WOK=$(echo "$DW" | jget write_test_ok | sed -n 's/^write_test_ok: //p')
[ "$WOK" = "True" ] && passfail ok "write_test_ok" || passfail fail "write_test failed"

hr
echo "[4] GET /api/config"
C=$(curl_json "$BASE_URL/api/config")
echo "$C" | pp
CP=$(echo "$C" | jget __config_path | sed -n 's/^__config_path: //p')
[ -n "$CP" ] && passfail ok "api/config path: $CP" || passfail fail "/api/config response"

hr
echo "Done."
