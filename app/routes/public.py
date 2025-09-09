# app/routes/public.py
from __future__ import annotations
from flask import Blueprint, send_from_directory, jsonify

from ..settings import STATIC_DIR
from ..sse import sse_stream
from ..storage import load_config
from ..countdown import derive_state

bp = Blueprint("public", __name__)

@bp.get("/")
def index():
    return send_from_directory(STATIC_DIR, "index.html")

@bp.get("/health")
def health():
    return jsonify({"status": "ok"}), 200

@bp.get("/sse")
def sse():
    return sse_stream()

@bp.get("/state")
def state():
    cfg = load_config()
    state_obj = derive_state(cfg)
    return jsonify(state_obj), 200

@bp.get("/tick")
def tick():
    from ..storage import load_config, get_config_path
    from ..countdown import compute_tick
    cfg = load_config()
    t = compute_tick(cfg)
    # legg til lite, ufarlig diag
    t["__config_path"] = str(get_config_path())
    t["__cfg_flags"] = {
        "has_daily_time": bool(cfg.get("daily_time")),
        "has_target_ms": bool(cfg.get("target_ms")),
        "has_target_iso": bool(cfg.get("target_datetime") or cfg.get("target_iso")),
    }
    return jsonify(t), 200
