# app/routes/api.py
from __future__ import annotations
from datetime import datetime
from flask import Blueprint, request, jsonify
from ..settings import TZ
from ..storage import (
    load_config, save_config_patch, set_mode, start_duration,
    clear_duration_and_switch_to_daily, get_defaults
)
from ..countdown import compute_tick
from ..auth import require_password

bp = Blueprint("api", __name__, url_prefix="/api")

@bp.get("/defaults")
def api_defaults():
    from ..storage import get_defaults
    return jsonify({"ok": True, "defaults": get_defaults()}), 200

@bp.get("/config")
def api_get_config():
    cfg = load_config()
    t = compute_tick(cfg)
    return jsonify({"ok": True, "config": cfg, "tick": t, "server_time": datetime.now(TZ).isoformat()}), 200

@bp.post("/config")
def api_post_config():
    data = request.get_json(silent=True) or {}
    if not isinstance(data, dict):
        return jsonify({"ok": False, "error": "Payload må være JSON-objekt"}), 400

    try:
        if "mode" in data:
            cfg = set_mode(
                str(data.get("mode")).strip().lower(),
                daily_time=str(data.get("daily_time") or ""),
                once_at=str(data.get("once_at") or ""),
                duration_minutes=int(data.get("duration_minutes") or 0) or None,
                clock=data.get("clock") if isinstance(data.get("clock"), dict) else None,
            )
        else:
            cfg = load_config()

        # “patch/merge” av øvrige felt
        passthrough = (
            "message_primary","message_secondary","show_message_primary","show_message_secondary",
            "warn_minutes","alert_minutes","blink_seconds","overrun_minutes","admin_password",
            "daily_time","once_at","duration_minutes", "theme","color_normal","color_warn","color_alert","color_over",
            "show_target_time","target_time_after","messages_position","use_blink","use_phase_colors","hms_threshold_minutes",
            "clock"
        )
        patch = {k: data[k] for k in passthrough if k in data}
        if patch:
            cfg = save_config_patch(patch)

        t = compute_tick(cfg)
        return jsonify({"ok": True, "config": cfg, "tick": t}), 200

    except ValueError as e:
        # Valideringsfeil fra storage → 400
        return jsonify({"ok": False, "error": str(e)}), 400
    except Exception:
        # Ikke lekk stacktrace til klient
        return jsonify({"ok": False, "error": "internal error"}), 500

@bp.post("/start-duration")
#@bp.post("/start")
@require_password
def start_duration_compat():
    """
    Kompatibilitetsalias for UI som kaller /api/start-duration eller /api/start_duration.
    Gjør identisk som /api/start: forventer JSON {"minutes": <int>}.
    """
    data = request.get_json(silent=True) or {}
    try:
        minutes = int(data.get("minutes"))
    except Exception:
        return jsonify({"ok": False, "error": "'minutes' må være heltall"}), 400
    if minutes <= 0:
        return jsonify({"ok": False, "error": "'minutes' må være > 0"}), 400

    cfg = start_duration(minutes)  # eksisterende storage-funksjon
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
