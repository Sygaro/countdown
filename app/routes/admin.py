# app/routes/admin.py
from __future__ import annotations

import time
from datetime import datetime, timedelta
from flask import Blueprint, request, jsonify, abort

from ..auth import require_password
from ..storage import load_config, save_config_patch, save_target_datetime, get_config_path
from ..countdown import derive_state
from ..sse import publish
from ..settings import TZ

bp = Blueprint("admin", __name__, url_prefix="/api")

@bp.get("/config")
@require_password
def admin_get_config():
    cfg = load_config()
    return jsonify({"config": cfg, "__config_path": str(get_config_path())}), 200

@bp.post("/config")
@require_password
def admin_post_config():
    payload = request.get_json(silent=True) or {}
    if not isinstance(payload, dict):
        return jsonify({"error": "Payload must be a JSON object"}), 400
    cfg = save_config_patch(payload)
    state = derive_state(cfg)
    publish({"type": "config_update", "config": cfg, "state": state})
    return jsonify({"ok": True, "config": cfg, "state": state, "__config_path": str(get_config_path())}), 200

@bp.post("/start")
@require_password
def admin_start():
    payload = request.get_json(silent=True) or {}
    try:
        minutes = int(payload.get("minutes", 0))
    except Exception:
        abort(400, "'minutes' må være et heltall")
    if minutes <= 0:
        abort(400, "'minutes' må være > 0")

    now = datetime.now(TZ)
    target = now + timedelta(minutes=minutes)

    cfg = save_target_datetime(target)
    state = derive_state(cfg)

    publish({"type": "config_update", "ts": time.time()})
    publish({"type": "config_update", "config": cfg, "state": state})

    return jsonify({"ok": True, "config": cfg, "state": state, "__config_path": str(get_config_path())}), 200
