# app/routes/admin.py
from __future__ import annotations
import time
from datetime import datetime, timedelta
from flask import Blueprint, request, jsonify, abort
from ..auth import require_password
from ..settings import TZ
from ..sse import publish
from ..countdown import derive_state
from ..storage import (
    load_config, save_config_patch, replace_config,
    save_target_datetime, get_config_path
)

bp = Blueprint("admin", __name__, url_prefix="/api")

@bp.get("/config")
def admin_get_config():
    cfg = load_config()
    return jsonify({"config": cfg, "__config_path": str(get_config_path())}), 200

@bp.post("/config")
@require_password
def admin_post_config():
    payload = request.get_json(silent=True) or {}
    if not isinstance(payload, dict):
        return jsonify({"error": "Payload must be a JSON object"}), 400
    payload["__source"] = "admin_post_config"
    cfg = save_config_patch(payload)
    state = derive_state(cfg)
    publish({"type": "config_update", "config": cfg, "state": state})
    return jsonify({"ok": True, "config": cfg, "state": state}), 200

@bp.post("/start")
@require_password
def admin_start():
    payload = request.get_json(silent=True) or {}
    minutes = payload.get("minutes")
    try:
        minutes = int(minutes)
    except Exception:
        abort(400, "'minutes' må være et heltall > 0")
    if minutes <= 0:
        abort(400, "'minutes' må være > 0")

    target = datetime.now(TZ) + timedelta(minutes=minutes)
    cfg = save_target_datetime(target, __source="admin_start")
    state = derive_state(cfg)
    publish({"type": "config_update", "config": cfg, "state": state})
    return jsonify({"ok": True, "config": cfg, "state": state}), 200
