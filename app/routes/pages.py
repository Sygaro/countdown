# app/routes/pages.py
"""
Sider og kompat-endepunkter.
Beholder /admin og statiske sider dine; retter også /tick + /debug/*.
"""
from __future__ import annotations
from flask import Blueprint, send_from_directory, jsonify, request
from ..settings import PROJECT_ROOT
from ..storage import load_config, clear_duration_and_switch_to_daily, replace_config
from ..countdown import compute_tick

bp = Blueprint("pages", __name__)

_STATIC = (PROJECT_ROOT / "static").resolve()

@bp.get("/")
def index():
    return send_from_directory(_STATIC, "index.html")

@bp.get("/admin")
def admin():
    return send_from_directory(_STATIC, "admin.html")

@bp.get("/diag")
def diag():
    return send_from_directory(_STATIC, "diag.html")

@bp.get("/about")
def about():
    return send_from_directory(_STATIC, "about.html")

@bp.get("/health")
def health():
    return {"ok": True}

@bp.get("/tick")
def tick():
    cfg = load_config()
    t = compute_tick(cfg)
    # Når varighetsmodus er fullført: bytt til daily (kravet b)
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

# Enkle debug-endepunkter som admin.js forventer:
@bp.get("/debug/whoami")
def dbg_whoami():
    return jsonify({
        "cwd": str(PROJECT_ROOT),
        "static": str(_STATIC),
        "config_path": str((PROJECT_ROOT / "config.json").resolve()),
    }), 200

@bp.get("/debug/config")
def dbg_config():
    write_test = request.args.get("write_test") == "1"
    cfg = load_config()
    result = {"ok": True, "__config_path": str((PROJECT_ROOT / "config.json").resolve())}
    if write_test:
        try:
            cfg["_debug_touch"] = True
            replace_config(cfg)
            cfg.pop("_debug_touch", None)
            replace_config(cfg)
            result["write_test_ok"] = True
        except Exception as e:
            result["write_test_ok"] = False
            result["error"] = str(e)
    result["config"] = cfg
    return jsonify(result), 200
