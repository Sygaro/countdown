# app/routes/public.py
from __future__ import annotations

from flask import Blueprint, send_from_directory, jsonify
from ..settings import STATIC_DIR
from ..storage import load_config, clear_duration_and_switch_to_daily
from ..countdown import compute_tick

bp = Blueprint("public", __name__)


@bp.get("/")
def index():
    return send_from_directory(STATIC_DIR, "index.html")


@bp.get("/health")
def health():
    return {"ok": True}


@bp.get("/state")
def state_snapshot():
    cfg = load_config()
    t = compute_tick(cfg)
    return jsonify(t), 200


@bp.get("/tick")
def tick():
    """
    Brukes av diagnose/admin for å polle status.
    Når varighetsmodus er ferdig, reverter automatisk til Daglig.
    """
    cfg = load_config()
    t = compute_tick(cfg)
    if t["state"] == "ended":
        # Hvis vi var i duration og den er ferdig -> bytt til daily.
        if cfg.get("mode") == "duration":
            clear_duration_and_switch_to_daily()
            # NB: svarer likevel med 'ended' nå; neste poll viser daglig target.
    return jsonify(t), 200
