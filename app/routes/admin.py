# app/routes/admin.py
from __future__ import annotations
from datetime import datetime, timedelta
from flask import Blueprint, request, jsonify, abort

from ..auth import require_password
from ..settings import TZ
from ..sse import publish
from ..countdown import derive_state
from ..storage import (
    load_config, save_config_patch, save_target_datetime, get_config_path
)

bp = Blueprint("admin", __name__, url_prefix="/api")

@bp.get("/config")
def admin_get_config():
    cfg = load_config()
    return jsonify({"__config_path": str(get_config_path()), "config": cfg}), 200

@bp.post("/config")
def admin_post_config():
    # Optional password
    pwd = request.headers.get("X-Admin-Password", "")
    if not require_password(pwd):
        abort(401)

    patch = request.get_json(silent=True) or {}
    if not isinstance(patch, dict):
        abort(400, "Forventet JSON-objekt")

    cfg = save_config_patch(patch)

    # push oppdatert state til evt. lyttere
    try:
        state = derive_state(cfg)
    except Exception as e:
        state = {"state": "unknown", "error": f"derive_state: {e}"}
    publish({"type": "config_update", "config": cfg, "state": state})

    return jsonify({"ok": True, "config": cfg}), 200

@bp.post("/start")
def admin_start():
    # Optional password
    pwd = request.headers.get("X-Admin-Password", "")
    if not require_password(pwd):
        abort(401)

    j = request.get_json(silent=True) or {}
    try:
        minutes = int(j.get("minutes"))
    except Exception:
        abort(400, "'minutes' må være et heltall > 0")
    if minutes <= 0:
        abort(400, "'minutes' må være > 0")

    target = datetime.now(TZ) + timedelta(minutes=minutes)
    cfg = save_target_datetime(target, __source="admin_start")

    try:
        state = derive_state(cfg)
    except Exception as e:
        state = {"state": "unknown", "error": f"derive_state: {e}"}

    publish({"type": "config_update", "config": cfg, "state": state})
    return jsonify({"ok": True, "config": cfg, "state": state}), 200
