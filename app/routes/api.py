# File: app/routes/api.py
# Purpose: REST-API for config (GET/POST) + kontrollendepunkter. Robust JSON-parsing,
#          konsistent feilmeldingsformat, tydelige statuskoder, og server_time i alle svar.

from __future__ import annotations
import shlex, subprocess, re, time
from datetime import datetime, timezone
from typing import Any, Dict, Tuple

from flask import Blueprint, request, jsonify, Response, current_app

from ..settings import TZ
from ..storage import (
    load_config,
    save_config_patch,
    set_mode,
    start_duration,
    clear_duration_and_switch_to_daily,
    get_defaults,
)
from ..countdown import compute_tick
from ..auth import require_password

bp = Blueprint("api", __name__, url_prefix="/api")

# === Utilities =================================================================

def _now_iso() -> str:
    return datetime.now(TZ).isoformat()

def _json_ok(payload: Dict[str, Any], status: int = 200) -> Response:
    data = {"ok": True, "server_time": _now_iso(), **payload}
    resp = jsonify(data)
    resp.status_code = status
    resp.headers["Cache-Control"] = "no-store"
    return resp

def _json_err(
    message: str,
    *,
    status: int = 400,
    code: str | None = None,
    extra: Dict[str, Any] | None = None,
) -> Response:
    data = {"ok": False, "error": message, "server_time": _now_iso()}
    if code:
        data["code"] = code
    if extra:
        data.update(extra)
    resp = jsonify(data)
    resp.status_code = status
    resp.headers["Cache-Control"] = "no-store"
    return resp

def _is_json_request() -> bool:
    ctype = request.headers.get("Content-Type", "")
    return "application/json" in ctype.lower() or request.is_json

def _coerce_int_or_none(v: Any) -> int | None:
    if v in (None, ""):
        return None
    try:
        return int(v)
    except (TypeError, ValueError):
        return None

def _coerce_positive_int(v: Any) -> int | None:
    try:
        iv = int(v) if not (isinstance(v, str) and not v.strip()) else None
    except (TypeError, ValueError):
        iv = None
    if iv is None or iv <= 0:
        return None
    return iv

def _run_cmd(args, timeout: int = 8) -> Tuple[bool, str, str, int]:
    """Kjør hvitlistede kommandoer uten shell. Prøv sudo -n, fall tilbake uten sudo."""
    try:
        r = subprocess.run(["sudo", "-n", *args], capture_output=True, text=True, timeout=timeout)
        if r.returncode == 0:
            return True, (r.stdout or "").strip(), (r.stderr or "").strip(), r.returncode
        r2 = subprocess.run(args, capture_output=True, text=True, timeout=timeout)
        return (r2.returncode == 0), (r2.stdout or "").strip(), (r2.stderr or "").strip(), r2.returncode
    except Exception as e:
        return False, "", str(e), -1

def _parse_kv(text: str) -> dict:
    d = {}
    for line in (text or "").splitlines():
        if "=" in line:
            k, v = line.split("=", 1)
            d[k.strip()] = v.strip()
    return d

# === Config/defaults ===========================================================

@bp.get("/defaults")
def api_defaults() -> Response:
    return _json_ok({"defaults": get_defaults()})

@bp.get("/config")
def api_get_config() -> Response:
    try:
        cfg = load_config()
        tick = compute_tick(cfg)
        return _json_ok({"config": cfg, "tick": tick})
    except Exception:
        current_app.logger.exception("GET /api/config failed")
        return _json_err("internal error", status=500, code="internal_error")

@bp.post("/config")
@require_password
def api_post_config() -> Response:
    if not _is_json_request():
        return _json_err("expected application/json", status=415, code="unsupported_media_type")

    data = request.get_json(silent=True) or {}
    if not isinstance(data, dict):
        return _json_err("payload must be a JSON object", status=400, code="bad_request")

    try:
        # 1) Eventuelt bytte modus
        if "mode" in data:
            mode = str(data.get("mode") or "").strip().lower()
            cfg = set_mode(
                mode,
                daily_time=str(data.get("daily_time") or ""),
                once_at=str(data.get("once_at") or ""),
                duration_minutes=_coerce_int_or_none(data.get("duration_minutes")),
                clock=(data.get("clock") if isinstance(data.get("clock"), dict) else None),
            )
        else:
            cfg = load_config()

        # 2) Patch/merge øvrige felt
        passthrough = (
            "message_primary",
            "message_secondary",
            "show_message_primary",
            "show_message_secondary",
            "warn_minutes",
            "alert_minutes",
            "blink_seconds",
            "overrun_minutes",
            "admin_password",
            "daily_time",
            "once_at",
            "duration_minutes",
            "theme",
            "color_normal",
            "color_warn",
            "color_alert",
            "color_over",
            "show_target_time",
            "target_time_after",
            "messages_position",
            "use_blink",
            "use_phase_colors",
            "hms_threshold_minutes",
            "clock",
            "overlays_mode",
            "overlays",
        )
        patch = {k: data[k] for k in passthrough if k in data}
        if patch:
            cfg = save_config_patch(patch)

        tick = compute_tick(cfg)
        return _json_ok({"config": cfg, "tick": tick})

    except ValueError as e:
        return _json_err(str(e), status=400, code="validation_error")
    except Exception:
        current_app.logger.exception("POST /api/config failed")
        return _json_err("internal error", status=500, code="internal_error")

# === Duration controls =========================================================

@bp.post("/start-duration")
@require_password
def api_start_duration() -> Response:
    if not _is_json_request():
        return _json_err("expected application/json", status=415, code="unsupported_media_type")

    data = request.get_json(silent=True) or {}
    minutes = _coerce_positive_int(data.get("minutes"))
    if minutes is None:
        return _json_err("'minutes' must be a positive integer", status=400, code="validation_error")

    try:
        cfg = start_duration(minutes)
        tick = compute_tick(cfg)
        return _json_ok({"config": cfg, "tick": tick})
    except ValueError as e:
        return _json_err(str(e), status=400, code="validation_error")
    except Exception:
        current_app.logger.exception("POST /api/start-duration failed")
        return _json_err("internal error", status=500, code="internal_error")

@bp.post("/stop")
@require_password
def stop() -> Response:
    try:
        cfg = clear_duration_and_switch_to_daily()
        tick = compute_tick(cfg)
        return _json_ok({"config": cfg, "tick": tick})
    except Exception:
        current_app.logger.exception("POST /api/stop failed")
        return _json_err("internal error", status=500, code="internal_error")

@bp.get("/status")
def status() -> Response:
    try:
        cfg = load_config()
        return _json_ok(compute_tick(cfg))
    except Exception:
        current_app.logger.exception("GET /api/status failed")
        return _json_err("internal error", status=500, code="internal_error")

# === Meta: routes listing ======================================================

@bp.get("/_routes")
def api_routes():
    routes = []
    for r in current_app.url_map.iter_rules():
        meths = getattr(r, "methods", set()) or set()
        methods = sorted(m for m in meths if m in {"GET", "POST", "PUT", "DELETE", "PATCH"})
        routes.append({"rule": str(r), "endpoint": r.endpoint, "methods": methods})
    return jsonify(ok=True, routes=routes)

# === System/services helpers ===================================================

def _svc_map() -> dict:
    """name -> {unit, scope}; 'web' er alias til 'app' for bakoverkomp."""
    return {
        "app":   {"unit": "countdown.service",   "scope": "user"},
        "web":   {"unit": "countdown.service",   "scope": "user"},  # alias
        "kiosk": {"unit": "kiosk-cog.service",   "scope": "system"},
    }

# === Service control endpoints ================================================

@bp.post("/sys/service")
@require_password
def sys_service():
    """POST { action: restart|reload|start|stop|status, name: app|web|kiosk }"""
    data = request.get_json(silent=True) or {}
    action = (data.get("action") or "").lower()
    name   = (data.get("name") or "").lower()
    services = _svc_map()

    if name not in services:
        return jsonify(ok=False, error=f"Unknown service '{name}'", allowed=list(services.keys())), 400
    if action not in {"restart", "reload", "start", "stop", "status"}:
        return jsonify(ok=False, error=f"Invalid action '{action}'"), 400

    meta  = services[name]
    unit  = meta["unit"]
    scope = meta["scope"]

    base = ["systemctl"] + (["--user"] if scope == "user" else [])
    # --no-block for å unngå at vi dreper vår egen HTTP-respons
    args = list(base)
    if action in {"restart", "start", "stop", "reload"}:
        args += [action, "--no-block", unit]
    else:
        args += [action, unit]

    ok, out, err, rc = _run_cmd(args)
    status_code = 200 if rc == 0 else 202  # 202 = accepted/igangsatt
    return jsonify(ok=(rc == 0), rc=rc, stdout=out, stderr=err, service=unit, scope=scope, action=action), status_code

@bp.post("/sys/reboot")
@require_password
def sys_reboot():
    ok, out, err, rc = _run_cmd(["systemctl", "reboot"])
    return jsonify(ok=ok, rc=rc, stdout=out, stderr=err), (200 if ok else 500)

@bp.post("/sys/shutdown")
@require_password
def sys_shutdown():
    ok, out, err, rc = _run_cmd(["systemctl", "poweroff"])
    return jsonify(ok=ok, rc=rc, stdout=out, stderr=err), (200 if ok else 500)

# === NTP utilities (robust last-contact) ======================================

def _ntp_last_sync_from_journal(max_lines: int = 500):
    """
    Returner (epoch_ms, source_str) for siste NTP-relaterte sync-event,
    basert på systemd journal. Bruker -o short-unix for enkel tidsstempel-parsing.
    """
    ok, out, err, rc = _run_cmd([
        "journalctl", "-u", "systemd-timesyncd",
        "--no-pager", "-n", str(max_lines), "-o", "short-unix"
    ], timeout=6)
    if not ok or not out:
        return None, None
    lines = out.splitlines()
    for line in reversed(lines):  # nyeste først
        m = re.match(r"^\s*([0-9]+(?:\.[0-9]+)?)\s+(.*)$", line)
        if not m:
            continue
        ts_epoch = float(m.group(1))
        msg = m.group(2)
        if ("Initial clock synchronization" in msg) or ("Synchronized to time server" in msg) or ("Contacted time server" in msg):
            src = None
            m2 = re.search(r"server\s+([0-9A-Za-z\.\-:]+)(?:[:\s]|$)", msg)
            if m2:
                src = m2.group(1)
            return int(ts_epoch * 1000), src
    return None, None

def _extract_destination_ts(ntp_message: str) -> int | None:
    """
    Plukk ut DestinationTimestamp fra 'NTPMessage={ ... }'.
    Returnerer epoch ms (bruker lokal TZ-formatet som timedatectl viser, men lagres som UTC-epochtime).
    """
    if not ntp_message:
        return None
    m = re.search(r"DestinationTimestamp=([A-Za-z]{3}\s+\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\s+[A-Za-z]+)", ntp_message)
    if not m:
        return None
    txt = m.group(1)  # f.eks: 'Sun 2025-09-21 14:13:25 CEST'
    try:
        dt = datetime.strptime(txt, "%a %Y-%m-%d %H:%M:%S %Z").replace(tzinfo=TZ)
        return int(dt.timestamp() * 1000)
    except Exception:
        return None

def _pick_last_contact(ts: dict, base: dict) -> Tuple[int | None, str | None]:
    """
    Velg 'siste kontakt' mellom LastSyncUSec og NTPMessage.DestinationTimestamp.
    Returnerer (epoch_ms, kilde).
    """
    best_ms = None
    src = None
    # LastSyncUSec (µs)
    try:
        us = int(ts.get("LastSyncUSec") or 0)
        if us > 0:
            best_ms = us // 1000
            src = "LastSyncUSec"
    except Exception:
        pass
    # DestinationTimestamp fra NTPMessage
    ntpmsg = base.get("NTPMessage") or ts.get("NTPMessage")
    dest_ms = _extract_destination_ts(ntpmsg or "")
    if dest_ms and (best_ms is None or dest_ms > best_ms):
        best_ms = dest_ms
        src = "DestinationTimestamp"
    return best_ms, src

# Liten cache for NTP (reduser journalctl-kall ved mange faner)
_NTP_CACHE = {"ts": 0.0, "payload": None}
_NTP_TTL_SEC = 15.0

def _compute_ntp_payload() -> dict:
    now = time.monotonic()
    if _NTP_CACHE["payload"] is not None and (now - _NTP_CACHE["ts"] < _NTP_TTL_SEC):
        return _NTP_CACHE["payload"]

    ok1, out1, _, _ = _run_cmd(["timedatectl", "show"])
    ok2, out2, _, _ = _run_cmd(["timedatectl", "show-timesync"])
    base = _parse_kv(out1) if ok1 else {}
    ts   = _parse_kv(out2) if ok2 else {}

    def to_bool(s): return str(s).lower() in {"1","true","yes"}

    last_ms, src = _pick_last_contact(ts, base)
    if not last_ms:
        j_ms, j_src = _ntp_last_sync_from_journal()
        if j_ms:
            last_ms = j_ms
            src = f"journal:{j_src or 'timesyncd'}"

    payload = {
        "NTPSynchronized":         to_bool(base.get("NTPSynchronized")),
        "SystemClockSynchronized": to_bool(base.get("SystemClockSynchronized")),
        "ServerName":              ts.get("ServerName"),
        "ServerAddress":           ts.get("ServerAddress"),
        "LastSyncUSec":            ts.get("LastSyncUSec"),
        "LastContactMS":           last_ms,
        "LastContactISO":          (datetime.fromtimestamp(last_ms/1000, tz=TZ).isoformat() if last_ms else None),
        "LastContactSource":       src,
        "NTPMessage":              base.get("NTPMessage"),
        "PollIntervalUSec":        ts.get("PollIntervalUSec"),
    }
    _NTP_CACHE["ts"] = now
    _NTP_CACHE["payload"] = payload
    return payload

# === NTP/API endpoints =========================================================

@bp.get("/sys/ntp-status")
@require_password
def sys_ntp_status():
    """Returnerer systemd timesync-status (normalisert, med 'LastContact*')."""
    try:
        return _json_ok({"ntp": _compute_ntp_payload()})
    except Exception:
        current_app.logger.exception("GET /api/sys/ntp-status failed")
        return _json_err("internal error", status=500, code="internal_error")

@bp.get("/sys/about-status")
@require_password
def sys_about_status():
    """Aggregert metadata/status for About-siden (inkl. starttid og tjenester)."""
    import os, platform

    # Versjon/commit (fra env hvis tilgjengelig, ellers git)
    ver = (os.environ.get("COUNTDOWN_VERSION") or "").strip() or None
    ok_git, out_git, _, _ = _run_cmd(["git", "rev-parse", "--short", "HEAD"])
    commit = out_git if ok_git and out_git else (os.environ.get("COUNTDOWN_COMMIT") or "").strip() or None

    # OS / HW
    uname = platform.uname()
    os_name = f"{uname.system} {uname.release}"
    kernel  = uname.version
    arch    = uname.machine
    os_pretty = None
    try:
        with open("/etc/os-release", "r", encoding="utf-8") as f:
            kv = {}
            for line in f:
                line=line.strip()
                if "=" in line:
                    k, v = line.split("=", 1)
                    kv[k] = v.strip().strip('"')
            os_pretty = kv.get("PRETTY_NAME") or kv.get("NAME")
    except Exception:
        pass
    model = None
    try:
        with open("/proc/device-tree/model", "rb") as f:
            model = f.read().decode("utf-8", "ignore").strip("\x00\r\n ")
    except Exception:
        pass

    # Tjenester (system vs user)
    services_map = _svc_map()
    svc_status = {}
    for name, meta in services_map.items():
        unit  = meta["unit"]
        scope = meta["scope"]
        base  = ["systemctl"] + (["--user"] if scope == "user" else [])
        ok_is, out_is, err_is, _ = _run_cmd(base + ["is-active", unit])
        active = (out_is.strip() == "active")
        ok_show, out_show, err_show, _ = _run_cmd(
            base + ["show", unit, "--no-pager",
                    "--property=ActiveState,SubState,ActiveEnterTimestamp,ExecMainStartTimestamp,Description"]
        )
        info = {}
        if ok_show:
            for line in out_show.splitlines():
                if "=" in line:
                    k, v = line.split("=", 1)
                    info[k.strip()] = v.strip()
        svc_status[name] = {
            "unit": unit,
            "scope": scope,
            "active": active,
            "substate": info.get("SubState"),
            "since": info.get("ActiveEnterTimestamp"),
            "exec_main_start": info.get("ExecMainStartTimestamp"),
            "description": info.get("Description"),
            "raw": (out_is or err_is or err_show),
        }

    ntp = _compute_ntp_payload()

    return _json_ok({
        "about": {
            "version": ver or "unknown",
            "commit": commit or "unknown",
            "server_time": _now_iso(),
            "os": os_pretty or os_name,
            "kernel": kernel,
            "arch": arch,
            "model": model or "unknown",
            "services": svc_status,
            "ntp": ntp,
        }
    })
