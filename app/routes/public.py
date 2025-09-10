# app/routes/public.py
from __future__ import annotations
import os, time
from pathlib import Path
from flask import Blueprint, send_from_directory, jsonify, request

from ..settings import STATIC_DIR
from ..sse import sse_stream
from ..countdown import compute_tick
from ..storage import load_config, get_config_path

bp = Blueprint("public", __name__)

_TICK_CACHE = {"ts": 0.0, "data": None}  # 1 Hz cache

@bp.get("/")
def index():
    return send_from_directory(STATIC_DIR, "index.html")

@bp.get("/admin")
def admin():
    return send_from_directory(STATIC_DIR, "admin.html")

@bp.get("/diag")
def diag():
    return send_from_directory(STATIC_DIR, "diag.html")

@bp.get("/about")
def about():
    return send_from_directory(STATIC_DIR, "about.html")

@bp.get("/health")
def health():
    return jsonify({"status": "ok"}), 200

@bp.get("/sse")
def sse():
    return sse_stream()

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

@bp.get("/debug/config")
def debug_config():
    """Lesbar diagnose for config-IO. Sett ?write_test=1 for å teste skriveadgang (lager/oppdaterer nøkkelen '_rw_probe')."""
    path = get_config_path().resolve()
    exists = path.exists()
    stat = None
    if exists:
        st = path.stat()
        stat = {
            "size": st.st_size,
            "mtime": st.st_mtime,
            "uid": st.st_uid,
            "gid": st.st_gid,
            "mode_octal": oct(st.st_mode & 0o777),
        }

    # Lesbare/s­krivbare?
    can_read = os.access(path, os.R_OK) if exists else False
    can_write_file = os.access(path, os.W_OK) if exists else False
    can_write_dir = os.access(path.parent, os.W_OK)

    # Valgfri skrive-test
    write_test = request.args.get("write_test") in ("1", "true", "yes")
    wrote = False
    if write_test and can_write_dir:
        from ..storage import save_config_patch, load_config
        cfg = load_config()
        cfg = save_config_patch({"_rw_probe": int(time.time())})
        wrote = True

    return jsonify({
        "path": str(path),
        "exists": exists,
        "stat": stat,
        "can_read": can_read,
        "can_write_file": can_write_file,
        "can_write_dir": can_write_dir,
        "write_test_executed": write_test,
        "write_test_ok": wrote,
    }), 200

# app/routes/public.py (kun endepunktet)
@bp.get("/debug/whoami")
def debug_whoami():
    import os, getpass, traceback
    try:
        from ..storage import get_config_path
        return jsonify({
            "user": getpass.getuser(),
            "uid": os.geteuid(),
            "gid": os.getegid(),
            "cwd": os.getcwd(),
            "config_path": str(get_config_path()),
            "env": {
                "COUNTDOWN_CONFIG": os.environ.get("COUNTDOWN_CONFIG", ""),
                "COUNTDOWN_TZ": os.environ.get("COUNTDOWN_TZ", ""),
            },
        }), 200
    except Exception as e:
        return jsonify({"error": str(e), "trace": traceback.format_exc()}), 500
