# app/routes/admin.py
from __future__ import annotations

from datetime import datetime
from flask import Blueprint, request, jsonify, abort

from ..auth import require_password
from ..storage import (
    load_config,
    save_config_patch,
    set_mode,
    start_duration,
)
from ..countdown import compute_tick
from ..settings import TZ

bp = Blueprint("admin", __name__)

@bp.get("/config")
def get_config():
    cfg = load_config()
    t = compute_tick(cfg)
    return jsonify({"ok": True, "config": cfg, "tick": t, "server_time": datetime.now(TZ).isoformat()}), 200

@bp.post("/config")
@require_password
def post_config():
    """
    Lagrer innstillinger OG/ELLER bytter modus.
    Forventer JSON. Felt som støttes:
      - mode: "daily"|"once"|"duration"
      - daily_time, once_at, duration_minutes
      - messages/varsler: message_primary, message_secondary, show_message_*, warn_minutes, alert_minutes, blink_seconds, overrun_minutes
      - admin_password (valgfritt)
    """
    data = request.get_json(silent=True) or {}
    if not isinstance(data, dict):
        abort(400, "Payload må være JSON-objekt")

    # 1) Hvis eksplisitt modus oppgis, sett den først (med tilhørende felt)
    if "mode" in data:
        mode = str(data.get("mode")).strip().lower()
        daily_time = str(data.get("daily_time") or "")
        once_at    = str(data.get("once_at") or "")
        duration_minutes = int(data.get("duration_minutes") or 0) or None
        try:
            cfg = set_mode(mode, daily_time=daily_time, once_at=once_at, duration_minutes=duration_minutes)
        except ValueError as e:
            return jsonify({"ok": False, "error": str(e)}), 400
    else:
        cfg = load_config()

    # 2) Andre felt (meldinger, varsler, admin)
    patch: dict = {}
    passthrough_keys = (
        "message_primary","message_secondary","show_message_primary","show_message_secondary",
        "warn_minutes","alert_minutes","blink_seconds","overrun_minutes","admin_password",
        "daily_time","once_at","duration_minutes"  # tillat oppdatering uten å endre mode
    )
    for k in passthrough_keys:
        if k in data:
            patch[k] = data[k]
    if patch:
        try:
            cfg = save_config_patch(patch)
        except ValueError as e:
            return jsonify({"ok": False, "error": str(e)}), 400

    t = compute_tick(cfg)
    return jsonify({"ok": True, "config": cfg, "tick": t}), 200


@bp.post("/start-duration")
@require_password
def post_start_duration():
    """
    Start varighetsmodus umiddelbart.
    Body: {"minutes": 10}
    """
    data = request.get_json(silent=True) or {}
    try:
        minutes = int(data.get("minutes"))
    except Exception:
        abort(400, "'minutes' må være et heltall")
    if minutes <= 0:
        abort(400, "'minutes' må være > 0")
    cfg = start_duration(minutes)
    t = compute_tick(cfg)
    return jsonify({"ok": True, "config": cfg, "tick": t}), 200
