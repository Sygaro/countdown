# app/routes/api.py

"""
REST-API for config og kontroll (brukes av admin-UI).
Herdet: nekter tom/ugyldig JSON i POST /api/config og /api/replace-config.
"""
from __future__ import annotations

from typing import Optional, Dict, Any
from werkzeug.exceptions import BadRequest
from flask import Blueprint, request, jsonify

from app.storage.api import (
    get_config as cfg_get_config,
    patch_config as cfg_patch_config,
    replace_config as cfg_replace_config,
)
from ..storage.duration import start_duration, stop_duration
from ..countdown import compute_tick

bp = Blueprint("api", __name__)


# --- helpers ---
def _require_admin(req) -> bool:
    """Sjekk admin-passord hvis konfigurert."""
    cfg = cfg_get_config()
    pw = cfg.get("admin_password", "")
    if not pw:
        return True
    return req.headers.get("X-Admin-Password") == pw


def _json_body_dict(required: bool = True) -> Optional[Dict[str, Any]]:
    """
    Les og valider at body er JSON-objekt. Returnerer dict eller None ved feil.
    """
    if required and not request.is_json:
        return None
    try:
        data = request.get_json(silent=False)  # kaster BadRequest ved ugyldig JSON
    except BadRequest:
        return None
    if not isinstance(data, dict):
        return None
    return data


# --- routes ---
@bp.get("/api/config")
def get_config():
    cfg = cfg_get_config()
    tick = compute_tick(cfg)
    return jsonify({"config": cfg, "tick": tick}), 200


@bp.post("/api/config")
def post_config():
    if not _require_admin(request):
        return jsonify({"error": "unauthorized"}), 403

    patch = _json_body_dict(required=True)
    if patch is None:
        return (
            jsonify(
                {
                    "error": "invalid or missing JSON body",
                    "hint": "Set header Content-Type: application/json and send a JSON object.",
                }
            ),
            400,
        )
    if not patch:
        return jsonify({"error": "empty patch"}), 400

    cfg = cfg_patch_config(patch)
    tick = compute_tick(cfg)
    return jsonify({"config": cfg, "tick": tick}), 200


@bp.post("/api/replace-config")
def post_cfg_replace_config():
    if not _require_admin(request):
        return jsonify({"error": "unauthorized"}), 403

    new_cfg = _json_body_dict(required=True)
    if new_cfg is None:
        return (
            jsonify(
                {
                    "error": "invalid or missing JSON body",
                    "hint": "Set header Content-Type: application/json and send a JSON object.",
                }
            ),
            400,
        )
    if not new_cfg:
        return jsonify({"error": "empty config"}), 400

    cfg_replace_config(new_cfg)
    cfg = cfg_get_config()
    tick = compute_tick(cfg)
    return jsonify({"config": cfg, "tick": tick}), 200


@bp.post("/api/start-duration")
def api_start_duration():
    if not _require_admin(request):
        return jsonify({"error": "unauthorized"}), 403

    body = _json_body_dict(required=True)
    if body is None:
        return jsonify({"error": "invalid or missing JSON body"}), 400

    minutes = int(body.get("minutes") or 0)
    if minutes <= 0:
        return jsonify({"error": "invalid minutes"}), 400

    start_duration(minutes)
    cfg = cfg_get_config()
    tick = compute_tick(cfg)
    return jsonify({"config": cfg, "tick": tick}), 200


@bp.post("/api/stop")
def api_stop_duration():
    if not _require_admin(request):
        return jsonify({"error": "unauthorized"}), 403

    stop_duration()
    cfg = cfg_get_config()
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
