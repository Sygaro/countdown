# app/routes/api.py
from __future__ import annotations
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional, Tuple
import json
from pathlib import Path
from flask import Blueprint, current_app, jsonify, request

from ..settings import TZ
from ..storage import (
    load_config, save_config_patch, set_mode, start_duration,
    clear_duration_and_switch_to_daily, get_defaults
)
from ..countdown import compute_tick
from ..auth import require_password

bp = Blueprint("api", __name__, url_prefix="/api")

@bp.get("/config")
def get_config():
    cfg = load_config()
    t = compute_tick(cfg)
    return jsonify({"ok": True, "config": cfg, "tick": t, "server_time": datetime.now(TZ).isoformat()}), 200

@bp.get("/defaults")
def get_defaults_api():
    # Kun de relevante delene for UI-reset; hele defaults er ok å eksponere.
    return jsonify({"ok": True, "defaults": get_defaults()}), 200

@bp.post("/config")
@require_password
def post_config():
    data = request.get_json(silent=True) or {}

    if "mode" in data:
        mode = str(data.get("mode")).strip().lower()
        daily_time = str(data.get("daily_time") or "")
        once_at = str(data.get("once_at") or "")
        duration_minutes = int(data.get("duration_minutes") or 0) or None
        screen = data.get("screen") if isinstance(data.get("screen"), dict) else None
        try:
            cfg = set_mode(mode, daily_time=daily_time, once_at=once_at, duration_minutes=duration_minutes, screen=screen)
        except ValueError as e:
            return jsonify({"ok": False, "error": str(e)}), 400
    else:
        cfg = load_config()

    passthrough = (
        # meldinger
        "message_primary","message_secondary","show_message_primary","show_message_secondary",
        # varsler
        "warn_minutes","alert_minutes","blink_seconds","overrun_minutes",
        # visning / oppførsel
        "use_blink","use_phase_colors",
        "color_normal","color_warn","color_alert","color_over",
        "show_target_time","target_time_after","messages_position","hms_threshold_minutes",
        # theme (minimal)
        "theme",
        # admin
        "admin_password",
        # tider og screen
        "daily_time","once_at","duration_minutes","screen"
    )
    patch = {k: data[k] for k in passthrough if k in data}
    if patch:
        try:
            cfg = save_config_patch(patch)
        except ValueError as e:
            return jsonify({"ok": False, "error": str(e)}), 400

    t = compute_tick(cfg)
    return jsonify({"ok": True, "config": cfg, "tick": t}), 200

@bp.post("/start")
@require_password
def start():
    data = request.get_json(silent=True) or {}
    try:
        minutes = int(data.get("minutes"))
    except Exception:
        return jsonify({"ok": False, "error": "'minutes' må være heltall"}), 400
    if minutes <= 0:
        return jsonify({"ok": False, "error": "'minutes' må være > 0"}), 400
    cfg = start_duration(minutes)
    t = compute_tick(cfg)
    return jsonify({"ok": True, "config": cfg, "tick": t}), 200

@bp.post("/stop")
@require_password
def stop():
    cfg = clear_duration_and_switch_to_daily()
    t = compute_tick(cfg)
    return jsonify({"ok": True, "config": cfg, "tick": t}), 200

@bp.get("/status")
def status():
    cfg = load_config()
    return jsonify(compute_tick(cfg)), 200

def _project_root() -> Path:
    try:
        # Hvis du har en settings.PROJECT_ROOT, bruk den
        from app.settings import PROJECT_ROOT  # type: ignore
        return PROJECT_ROOT
    except Exception:
        return Path(__file__).resolve().parents[2]

def _config_path() -> Path:
    # Bruk samme sti som /api/config. Hvis du har en egen ConfigStore, bytt til den.
    cfg_env = current_app.config.get("COUNTDOWN_CONFIG_PATH")
    if cfg_env:
        return Path(cfg_env)
    return _project_root() / "config.json"

def _read_config() -> Dict[str, Any]:
    """
    Prøver å bruke eksisterende config-loader om tilgjengelig.
    Fallback: leser JSON fra config.json.
    """
    # 1) Egen store?
    try:
        from app.services.config_store import get_config  # type: ignore
        cfg = get_config()
        if isinstance(cfg, dict):
            return cfg
    except Exception:
        pass

    # 2) Fallback: fil
    p = _config_path()
    if p.exists():
        with p.open("r", encoding="utf-8") as f:
            return json.load(f)
    return {}

# -----------------------------
# Tidsberegning for /tick
# -----------------------------

def _parse_iso_to_ms(s: str) -> Optional[int]:
    try:
        # Støtt "YYYY-mm-ddTHH:MM:SS" med/uten 'Z'
        if s.endswith("Z"):
            dt = datetime.fromisoformat(s.replace("Z", "+00:00"))
        else:
            dt = datetime.fromisoformat(s)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
        return int(dt.timestamp() * 1000)
    except Exception:
        return None

def _today_hhmm_to_target_ms(hhmm: str, now: datetime) -> Optional[int]:
    try:
        hour, minute = [int(x) for x in hhmm.split(":")]
        target = now.replace(hour=hour, minute=minute, second=0, microsecond=0)
        if target <= now:
            target = target + timedelta(days=1)  # neste dag
        return int(target.timestamp() * 1000)
    except Exception:
        return None

def _ms() -> int:
    return int(datetime.now(tz=timezone.utc).timestamp() * 1000)

def _compute_tick(cfg: Dict[str, Any]) -> Dict[str, Any]:
    """
    Returnerer payload frontenden forventer.
    Felter:
      - now_ms, target_ms, signed_display_ms, display_ms
      - warn_ms, alert_ms, overrun_ms
      - target_hhmm (for daily), mode/state
    """
    now_ms = _ms()

    mode = str(cfg.get("mode", "daily")).lower()
    warn_min  = int(cfg.get("warn_minutes", 4))
    alert_min = int(cfg.get("alert_minutes", 2))
    over_min  = int(cfg.get("overrun_minutes", 1))

    warn_ms   = max(0, warn_min) * 60_000
    alert_ms  = max(0, alert_min) * 60_000
    overrun_ms= max(0, over_min) * 60_000

    target_ms: Optional[int] = None
    target_hhmm: Optional[str] = None
    state = "countdown"

    now_dt = datetime.now(tz=timezone.utc)

    if mode == "screen":
        # Stopp-skjerm – frontenden skjuler digits når t.mode == 'screen'
        return {
            "now_ms": now_ms,
            "target_ms": now_ms,
            "signed_display_ms": 0,
            "display_ms": 0,
            "warn_ms": warn_ms,
            "alert_ms": alert_ms,
            "overrun_ms": overrun_ms,
            "target_hhmm": None,
            "mode": "screen",
            "state": "screen",
            "blink": bool(cfg.get("use_blink", False)),
        }

    elif mode == "daily":
        hhmm = str(cfg.get("daily_time") or "").strip()
        target_hhmm = hhmm if hhmm else None
        if hhmm:
            target_ms = _today_hhmm_to_target_ms(hhmm, now_dt)
        else:
            state = "idle"

    elif mode == "once":
        iso = str(cfg.get("once_at") or "").strip()
        if iso:
            target_ms = _parse_iso_to_ms(iso)
        else:
            state = "idle"

    elif mode == "duration":
        # Forvent at /api/start-duration har satt target_ms
        tm = cfg.get("target_ms")
        if isinstance(tm, (int, float)):
            target_ms = int(tm)
        else:
            state = "idle"

    # Hvis vi fortsatt mangler target, sett display til 0 men behold meta
    if not isinstance(target_ms, int):
        return {
            "now_ms": now_ms,
            "target_ms": None,
            "signed_display_ms": 0,
            "display_ms": 0,
            "warn_ms": warn_ms,
            "alert_ms": alert_ms,
            "overrun_ms": overrun_ms,
            "target_hhmm": target_hhmm,
            "mode": mode,
            "state": state,
            "blink": bool(cfg.get("use_blink", False)),
        }

    signed = int(target_ms - now_ms)
    display_ms = abs(signed)

    # Sett enkel state
    if signed < 0:
        state = "overrun" if abs(signed) <= overrun_ms else "done"
    else:
        state = "countdown"

    return {
        "now_ms": now_ms,
        "target_ms": target_ms,
        "signed_display_ms": signed,
        "display_ms": display_ms,
        "warn_ms": warn_ms,
        "alert_ms": alert_ms,
        "overrun_ms": overrun_ms,
        "target_hhmm": target_hhmm,
        "mode": "normal" if mode in {"daily","once","duration"} else mode,
        "state": state,
        "blink": bool(cfg.get("use_blink", False)),
    }

# -----------------------------
# /tick
# -----------------------------

@current_app.before_first_request
def _init_heartbeat_store():  # type: ignore[no-redef]
    # Sikrer at vi kan lagre heartbeat i app-konfig
    current_app.config.setdefault("_HEARTBEAT", {"ts": None, "rev": 0})

@bp.get("/tick")
def api_tick():
    """
    Beregn og returner live-tick.
    Merk: Endpoint er /api/tick, men frontenden kaller /tick (uten prefiks).
    Vi lager også en toppnivå-alias nedenfor hvis det finnes en 'root' blueprint.
    """
    cfg = _read_config()
    return jsonify(_compute_tick(cfg))

# OBS: Frontenden kaller /tick uten /api. Legg til toppnivå-alias hvis appen ikke allerede har det.
# Dette krever at hoved-appen (create_app) registrerer denne blueprinten på /api.
# Vi monterer et alias på root via samme blueprint hvis mulig.
@bp.get("/../tick")  # fungerer ikke i Flask – kun dokumentasjon
def _noop():
    pass

# app/routes/api.py  (UTDRAG – HEARTBEAT)
@bp.post("/debug/heartbeat")
def debug_heartbeat_post():
    """
    Frontend sender {ts, rev, from} for enkel synk-monitorering.
    """
    hb = current_app.config.setdefault("_HEARTBEAT", {"ts": None, "rev": 0})
    payload = request.get_json(silent=True) or {}
    hb["ts"] = int(payload.get("ts") or _ms())
    hb["rev"] = int(payload.get("rev") or 0)
    hb["from"] = str(payload.get("from") or "view")
    return jsonify({"ok": True})

@bp.get("/debug/view-heartbeat")
def debug_view_heartbeat():
    hb = current_app.config.get("_HEARTBEAT", {})
    ts = hb.get("ts")
    age = None
    if ts:
        age = max(0, (_ms() - int(ts)) / 1000.0)
    return jsonify({
        "heartbeat": {
            "ts": ts,
            "ts_iso": datetime.fromtimestamp((ts or _ms())/1000, tz=timezone.utc).isoformat(),
            "age_seconds": age,
            "rev": hb.get("rev", 0),
            "from": hb.get("from", "view"),
        }
    })
