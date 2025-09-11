# app/routes/api.py
"""
API-endepunkter i tråd med README:
- GET  /api/config      -> les config
- POST /api/config      -> lagre config (inkl. bytte modus)
- POST /api/start       -> start varighet N minutter (setter mode=duration)
- GET  /tick            -> status/tick (kompat)
- GET  /state           -> kompat snapshot (enkelt)
"""
from __future__ import annotations

from datetime import datetime
from flask import Blueprint, request, jsonify

from ..settings import TZ
from ..storage import (
    load_config,
    save_config_patch,
    set_mode,
    start_duration,
    clear_duration_and_switch_to_daily,
)
from ..countdown import compute_tick
from ..auth import require_password  # eksisterende dekoratør i prosjektet

bp = Blueprint("api", __name__, url_prefix="/api")

@bp.get("/config")
def get_config():
    cfg = load_config()
    t = compute_tick(cfg)
    return jsonify({"ok": True, "config": cfg, "tick": t, "server_time": datetime.now(TZ).isoformat()}), 200

@bp.post("/config")
@require_password
def post_config():
    data = request.get_json(silent=True) or {}
    # Tillat eksplisitt bytte av modus:
    if "mode" in data:
        mode = str(data.get("mode")).strip().lower()
        daily_time = str(data.get("daily_time") or "")
        once_at = str(data.get("once_at") or "")
        duration_minutes = int(data.get("duration_minutes") or 0) or None
        cfg = set_mode(mode, daily_time=daily_time, once_at=once_at, duration_minutes=duration_minutes)
    else:
        cfg = load_config()

    # Oppdater øvrige felter (meldinger/varsler/admin)
    passthrough = (
        "message_primary","message_secondary","show_message_primary","show_message_secondary",
        "warn_minutes","alert_minutes","blink_seconds","overrun_minutes","admin_password",
        "daily_time","once_at","duration_minutes"
    )
    patch = {k: data[k] for k in passthrough if k in data}
    if patch:
        cfg = save_config_patch(patch)

    t = compute_tick(cfg)
    return jsonify({"ok": True, "config": cfg, "tick": t}), 200

@bp.post("/start")
@require_password
def start():
    """
    Start varighet. Body: {"minutes": <int>}
    """
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

# Kompatible "public" endepunkter (ikke under /api)
@bp.get("/status")
def status():
    cfg = load_config()
    return jsonify(compute_tick(cfg)), 200
