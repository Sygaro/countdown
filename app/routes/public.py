# app/routes/public.py
from __future__ import annotations
import time
from flask import Blueprint, send_from_directory, jsonify
from ..settings import STATIC_DIR
from ..sse import sse_stream
from ..countdown import compute_tick
from ..storage import load_config, get_config_path

bp = Blueprint("public", __name__)
_TICK_CACHE = {"ts": 0.0, "data": None}  # 1 Hz mini-cache

@bp.get("/")
def index(): return send_from_directory(STATIC_DIR, "index.html")

@bp.get("/admin")
def admin(): return send_from_directory(STATIC_DIR, "admin.html")

@bp.get("/diag")
def diag(): return send_from_directory(STATIC_DIR, "diag.html")

@bp.get("/health")
def health(): return jsonify({"status": "ok"}), 200

@bp.get("/sse")
def sse(): return sse_stream()

@bp.get("/tick")
def tick():
    now = time.monotonic()
    if _TICK_CACHE["data"] is not None and (now - _TICK_CACHE["ts"]) < 1.0:
        return jsonify(_TICK_CACHE["data"]), 200
    cfg = load_config()
    t = compute_tick(cfg)
    t["__config_path"] = str(get_config_path().resolve())
    t["__cfg_flags"] = {
        "has_daily_time": bool(cfg.get("daily_time")),
        "has_target_ms": bool(cfg.get("target_ms")),
        "has_target_iso": bool(cfg.get("target_datetime") or cfg.get("target_iso")),
    }
    _TICK_CACHE.update(ts=now, data=dict(t))
    return jsonify(t), 200

# app/routes/public.py – legg til
@bp.get("/about")
def about():
    return send_from_directory(STATIC_DIR, "about.html")
