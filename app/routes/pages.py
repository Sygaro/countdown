# app/routes/pages.py
"""
Sider + kompat-endepunkter + debug/selftest + view-heartbeat.
Bevisst lettvekts—API-ansvar ligger i routes/api.py.
"""
from __future__ import annotations
from datetime import datetime, timedelta, timezone
from flask import Blueprint, send_from_directory, jsonify, request, Response
from ..settings import PROJECT_ROOT, TZ
from ..storage import load_config, clear_duration_and_switch_to_daily, replace_config
from ..countdown import compute_tick, compute_target_ms
bp = Blueprint("pages", __name__)
_STATIC = (PROJECT_ROOT / "static").resolve()
# Enkel in-memory heartbeat fra visningen (for Admin-synk)
_LAST_VIEW_HEARTBEAT = {"rev": 0, "ts": None, "page": "view"}  # ts = aware datetime
def _json_nostore(payload, status: int = 200) -> Response:
    """Hvorfor: status-/debug-svar skal ikke caches av klient/proxy."""
    resp = jsonify(payload)
    resp.status_code = status
    resp.headers["Cache-Control"] = "no-store"
    return resp
@bp.post("/debug/view-heartbeat")
def view_hb_post():
    try:
        data = request.get_json(silent=True) or {}
        rev = int(data.get("rev") or 0)
        page = str(data.get("page") or "view")
    except Exception:
        rev = 0
        page = "view"
    _LAST_VIEW_HEARTBEAT["rev"] = rev
    _LAST_VIEW_HEARTBEAT["page"] = page
    _LAST_VIEW_HEARTBEAT["ts"] = datetime.now(timezone.utc)
    return _json_nostore({"ok": True})
@bp.get("/debug/view-heartbeat")
def view_hb_get():
    hb = dict(_LAST_VIEW_HEARTBEAT)
    ts = hb.get("ts")
    hb["ts_iso"] = ts.isoformat() if ts else None
    hb["age_seconds"] = (
        (datetime.now(timezone.utc) - ts).total_seconds() if ts else None
    )
    return _json_nostore({"ok": True, "heartbeat": hb})
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
    return _json_nostore({"ok": True})
@bp.get("/tick")
def tick():
    cfg = load_config()
    t = compute_tick(cfg)
    if t["state"] == "ended" and cfg.get("mode") == "duration":
        clear_duration_and_switch_to_daily()
    t["cfg_rev"] = int(cfg.get("_updated_at", 0))
    return _json_nostore(t)
@bp.get("/state")
def state_snapshot():
    cfg = load_config()
    t = compute_tick(cfg)
    return _json_nostore(
        {
            "now_ms": t["now_ms"],
            "target_ms": t["target_ms"],
            "display_ms": t["display_ms"],
            "signed_display_ms": t["signed_display_ms"],
            "state": t["state"],
            "mode": t["mode"],
        }
    )
@bp.get("/debug/whoami")
def dbg_whoami():
    return _json_nostore(
        {
            "cwd": str(PROJECT_ROOT),
            "static": str(_STATIC),
            "config_path": str((PROJECT_ROOT / "config.json").resolve()),
            "server_time": datetime.now(TZ).isoformat(),
        }
    )
@bp.get("/debug/config")
def dbg_config():
    write_test = request.args.get("write_test") == "1"
    cfg = load_config()
    result = {
        "ok": True,
        "__config_path": str((PROJECT_ROOT / "config.json").resolve()),
    }
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
    return _json_nostore(result)
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
    return _json_nostore({"ok": ok_all, "tests": tests})
