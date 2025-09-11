# app/routes/pages.py
"""
Side-ruter:
- /         -> index.html (visning)
- /admin    -> server admin-siden (uten å endre eksisterende filer/stil)
- /health   -> 200-ok
- /tick     -> kompat status (bruker compute_tick)
- /state    -> veldig enkel snapshot (for evt. gammel klient)
"""
from __future__ import annotations

from flask import Blueprint, send_from_directory, jsonify
from ..settings import PROJECT_ROOT
from ..storage import load_config, clear_duration_and_switch_to_daily
from ..countdown import compute_tick

bp = Blueprint("pages", __name__)

_STATIC = PROJECT_ROOT / "static"

@bp.get("/")
def index():
    return send_from_directory(_STATIC, "index.html")

@bp.get("/admin")
def admin():
    # Viktig: ikke bryte eksisterende admin-side/stil. Vi serverer den filen du har i static/.
    return send_from_directory(_STATIC, "admin.html")

@bp.get("/health")
def health():
    return {"ok": True}

@bp.get("/tick")
def tick():
    cfg = load_config()
    t = compute_tick(cfg)
    # Auto-revert duration -> daily når tiden er ute:
    if t["state"] == "ended" and cfg.get("mode") == "duration":
        clear_duration_and_switch_to_daily()
    return jsonify(t), 200

@bp.get("/state")
def state_snapshot():
    cfg = load_config()
    t = compute_tick(cfg)
    return jsonify({
        "now_ms": t["now_ms"],
        "target_ms": t["target_ms"],
        "display_ms": t["display_ms"],
        "signed_display_ms": t["signed_display_ms"],
        "state": t["state"],
        "mode": t["mode"],
    }), 200
