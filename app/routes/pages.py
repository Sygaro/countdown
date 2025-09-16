"""
Sider + kompat-endepunkter + debug/selftest + view-heartbeat.
"""
from __future__ import annotations
from datetime import datetime, timedelta, timezone
from flask import Blueprint, send_from_directory, jsonify, request
from app.settings import PROJECT_ROOT, TZ
from app.storage.api import load_config, clear_duration_and_switch_to_daily, replace_config
from app.countdown import compute_tick, compute_target_ms

bp = Blueprint("pages", __name__)

_STATIC = (PROJECT_ROOT / "static").resolve()

# --- Enkelt in-memory heartbeat fra visningen (for Admin-synk) ---
_LAST_VIEW_HEARTBEAT = {"rev": 0, "ts": None, "page": "view"}  # ts = aware datetime


def _tick_response(cfg, minimal=False):
    t = compute_tick(cfg)
    if t["state"] == "ended" and cfg.get("mode") == "duration":
        cfg = clear_duration_and_switch_to_daily()
        t = compute_tick(cfg)
    if not minimal:
        t["cfg_rev"] = int(cfg.get("_updated_at", 0))
    return jsonify(t), 200


@bp.post("/debug/view-heartbeat")
def view_hb_post():
    try:
        data = request.get_json(silent=True) or {}
        rev = int(data.get("rev") or 0)
        page = str(data.get("page") or "view")
    except Exception:
        rev, page = 0, "view"
    _LAST_VIEW_HEARTBEAT.update({
        "rev": rev,
        "page": page,
        "ts": datetime.now(timezone.utc),
    })
    return jsonify({"ok": True})


@bp.get("/debug/view-heartbeat")
def view_hb_get():
    hb = dict(_LAST_VIEW_HEARTBEAT)
    ts = hb.get("ts")
    hb["ts_iso"] = ts.isoformat() if ts else None
    hb["age_seconds"] = (datetime.now(timezone.utc) - ts).total_seconds() if ts else None
    return jsonify({"ok": True, "heartbeat": hb})


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
    return _tick_response(cfg)


@bp.get("/state")
def state_snapshot():
    cfg = load_config()
    return _tick_response(cfg, minimal=True)


@bp.get("/debug/whoami")
def dbg_whoami():
    return jsonify({
        "cwd": str(PROJECT_ROOT),
        "static": str(_STATIC),
        "config_path": str((PROJECT_ROOT / "config.json").resolve()),
        "server_time": datetime.now(TZ).isoformat(),
    }), 200


@bp.get("/debug/config")
def dbg_config():
    cfg = load_config()
    result = {
        "ok": True,
        "__config_path": str((PROJECT_ROOT / "config.json").resolve()),
        "config": cfg,
    }
    return jsonify(result), 200


@bp.get("/debug/selftest")
def dbg_selftest():
    tests = []
    ok_all = True

    def add(name: str, ok: bool, info: str = ""):
        nonlocal ok_all
        tests.append({"name": name, "ok": bool(ok), "info": info})
        ok_all = ok_all and ok

    cfg = {"mode": "daily", "daily_time": "09:00", "overrun_minutes": 2}
    now = datetime.now(TZ).replace(hour=9, minute=1, second=0, microsecond=0)
    target1 = compute_target_ms(cfg, now_ms=int(now.timestamp() * 1000))
    from datetime import datetime as _dt
    add("daily_overrun_window", _dt.fromtimestamp(target1 / 1000, tz=TZ).hour == 9)

    now2 = datetime.now(TZ)
    future = (now2 + timedelta(minutes=30)).replace(second=0, microsecond=0)
    cfg2 = {"mode": "once", "once_at": future.isoformat()}
    target2 = compute_target_ms(cfg2, now_ms=int(now2.timestamp() * 1000))
    add("once_future", target2 == int(future.timestamp() * 1000))

    start_ms = int(now2.timestamp() * 1000)
    cfg3 = {"mode": "duration", "duration_minutes": 10, "duration_started_ms": start_ms}
    target3 = compute_target_ms(cfg3, now_ms=start_ms)
    add("duration_10min", target3 == start_ms + 10 * 60_000)

    return jsonify({"ok": ok_all, "tests": tests}), 200
