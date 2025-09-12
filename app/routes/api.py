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
