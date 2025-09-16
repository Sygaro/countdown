# app/routes/api.py
"""
REST-API for config og kontroll (brukes av admin-UI).
"""
from __future__ import annotations
from flask import Blueprint, request, jsonify

from app.storage.api import get_config, patch_config, replace_config
from ..storage.duration import start_duration, stop_duration
from ..countdown import compute_tick

bp = Blueprint("api", __name__)


# --- helpers ---
def _require_admin(req) -> bool:
    """Sjekk admin-passord hvis konfigurert."""
    cfg = get_config()
    pw = cfg.get("admin_password", "")
    if not pw:
        return True
    return request.headers.get("X-Admin-Password") == pw


# --- routes ---
@bp.get("/api/config")
def get_config():
    cfg = get_config()
    tick = compute_tick(cfg)
    return jsonify({"config": cfg, "tick": tick}), 200


@bp.post("/api/config")
def post_config():
    if not _require_admin(request):
        return jsonify({"error": "unauthorized"}), 403

    patch = request.get_json(silent=True) or {}
    cfg = patch_config(patch)
    tick = compute_tick(cfg)
    return jsonify({"config": cfg, "tick": tick}), 200


@bp.post("/api/replace-config")
def post_replace_config():
    if not _require_admin(request):
        return jsonify({"error": "unauthorized"}), 403

    new_cfg = request.get_json(silent=True) or {}
    replace_config(new_cfg)
    cfg = get_config()
    tick = compute_tick(cfg)
    return jsonify({"config": cfg, "tick": tick}), 200


@bp.post("/api/start-duration")
def api_start_duration():
    if not _require_admin(request):
        return jsonify({"error": "unauthorized"}), 403

    body = request.get_json(silent=True) or {}
    minutes = int(body.get("minutes") or 0)
    if minutes <= 0:
        return jsonify({"error": "invalid minutes"}), 400

    start_duration(minutes)
    cfg = get_config()
    tick = compute_tick(cfg)
    return jsonify({"config": cfg, "tick": tick}), 200


@bp.post("/api/stop")
def api_stop_duration():
    if not _require_admin(request):
        return jsonify({"error": "unauthorized"}), 403

    stop_duration()
    cfg = get_config()
    tick = compute_tick(cfg)
    return jsonify({"config": cfg, "tick": tick}), 200


@bp.get("/api/defaults")
def api_defaults():
    """
    Returnerer standardverdier for UI (brukes i admin).
    Her kan vi hente ut default theme / background / digits fra koden.
    """
    defaults = {
        "theme": {
            "digits": {"size_vmin": 14},
            "messages": {
                "primary": {"size_rem": 1.0, "weight": 600, "color": "#9aa4b2"},
                "secondary": {"size_rem": 1.0, "weight": 400, "color": "#9aa4b2"},
            },
            "background": {
                "mode": "solid",
                "solid": {"color": "#0b0f14"},
                "gradient": {"from": "#142033", "to": "#0b0f14", "angle_deg": 180},
                "image": {
                    "url": "",
                    "fit": "cover",
                    "opacity": 1,
                    "tint": {"color": "#000000", "opacity": 0},
                },
            },
        }
    }
    return jsonify({"defaults": defaults}), 200
