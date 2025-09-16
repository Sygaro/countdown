from __future__ import annotations
from datetime import datetime
from flask import Blueprint, request, jsonify
from app.settings import TZ
from app.storage.api import (
    load_config,
    save_config_patch,
    set_mode,
    start_duration,
    clear_duration_and_switch_to_daily,
)
from app.storage.defaults import get_defaults
from app.countdown import compute_tick
from app.auth import require_password

bp = Blueprint("api", __name__, url_prefix="/api")


def _response(cfg):
    return jsonify({"ok": True, "config": cfg, "tick": compute_tick(cfg)}), 200


@bp.get("/defaults")
def api_defaults():
    return jsonify({"ok": True, "defaults": get_defaults()}), 200


@bp.get("/config")
def api_get_config():
    cfg = load_config()
    return jsonify({
        "ok": True,
        "config": cfg,
        "tick": compute_tick(cfg),
        "server_time": datetime.now(TZ).isoformat(),
    }), 200


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
                clock=(data.get("clock") if isinstance(data.get("clock"), dict) else None),
            )
        else:
            cfg = load_config()

        # Send hele payloaden videre, storage saniterer
        cfg = save_config_patch(data)
        return _response(cfg)

    except ValueError as e:
        return jsonify({"ok": False, "error": str(e)}), 400
    except Exception as e:
        # logg feilen her (men ikke send stacktrace til klient)
        return jsonify({"ok": False, "error": "internal error"}), 500


@bp.post("/start-duration")
def api_start_duration():
    if not request.is_json:
        return jsonify({"ok": False, "error": "expected application/json"}), 415

    data = request.get_json(silent=True) or {}
    minutes_val = data.get("minutes")

    try:
        if isinstance(minutes_val, (int, float)):
            minutes = int(minutes_val)
        elif isinstance(minutes_val, str) and minutes_val.strip():
            minutes = int(minutes_val.strip())
        else:
            raise ValueError
    except (TypeError, ValueError):
        return jsonify({"ok": False, "error": "'minutes' må være heltall"}), 400

    if minutes <= 0:
        return jsonify({"ok": False, "error": "'minutes' må være > 0"}), 400

    cfg = start_duration(minutes)
    return _response(cfg)


@bp.post("/stop")
@require_password
def stop():
    cfg = clear_duration_and_switch_to_daily()
    return _response(cfg)


@bp.get("/status")
def status():
    cfg = load_config()
    return jsonify(compute_tick(cfg)), 200
