# File: app/routes/api.py
# Purpose: REST-API for config (GET/POST) + kontrollendepunkter. Robust JSON-parsing,
#          konsistent feilmeldingsformat, tydelige statuskoder, og server_time i alle svar.
# Replaces: app/routes/api.py
# Notes: Avhenger av storage-funksjoner og require_password-dekoratør. Endepunktkontrakter beholdt.

from __future__ import annotations

from datetime import datetime
from typing import Any, Dict

from flask import Blueprint, request, jsonify, Response, current_app

from ..settings import TZ
from ..storage import (
    load_config,
    save_config_patch,
    set_mode,
    start_duration,
    clear_duration_and_switch_to_daily,
    get_defaults,
)
from ..countdown import compute_tick
from ..auth import require_password

bp = Blueprint("api", __name__, url_prefix="/api")


# === Utilities =================================================================


def _now_iso() -> str:
    return datetime.now(TZ).isoformat()


def _json_ok(payload: Dict[str, Any], status: int = 200) -> Response:
    """Suksessrespons – legger alltid på server_time."""
    data = {"ok": True, "server_time": _now_iso(), **payload}
    resp = jsonify(data)
    resp.status_code = status
    resp.headers["Cache-Control"] = "no-store"
    return resp


def _json_err(
    message: str,
    *,
    status: int = 400,
    code: str | None = None,
    extra: Dict[str, Any] | None = None,
) -> Response:
    """Feilrespons – ensartet format for alle feiltyper."""
    data = {"ok": False, "error": message, "server_time": _now_iso()}
    if code:
        data["code"] = code
    if extra:
        data.update(extra)
    resp = jsonify(data)
    resp.status_code = status
    resp.headers["Cache-Control"] = "no-store"
    return resp


def _is_json_request() -> bool:
    ctype = request.headers.get("Content-Type", "")
    return "application/json" in ctype.lower() or request.is_json


# === Routes: defaults/config ===================================================


@bp.get("/defaults")
def api_defaults() -> Response:
    return _json_ok({"defaults": get_defaults()})


@bp.get("/config")
def api_get_config() -> Response:
    try:
        cfg = load_config()
        tick = compute_tick(cfg)
        return _json_ok({"config": cfg, "tick": tick})
    except Exception:
        current_app.logger.exception("GET /api/config failed")
        return _json_err("internal error", status=500, code="internal_error")


@bp.post("/config")
@require_password
def api_post_config() -> Response:
    # Behold kontrakt: POST /config kan bytte mode *eller* patche felt.
    if not _is_json_request():
        return _json_err(
            "expected application/json", status=415, code="unsupported_media_type"
        )

    data = request.get_json(silent=True) or {}
    if not isinstance(data, dict):
        return _json_err(
            "payload must be a JSON object", status=400, code="bad_request"
        )

    try:
        # 1) Eventuelt bytte modus
        if "mode" in data:
            mode = str(data.get("mode") or "").strip().lower()
            cfg = set_mode(
                mode,
                daily_time=str(data.get("daily_time") or ""),
                once_at=str(data.get("once_at") or ""),
                duration_minutes=_coerce_int_or_none(data.get("duration_minutes")),
                clock=(
                    data.get("clock") if isinstance(data.get("clock"), dict) else None
                ),
            )
        else:
            cfg = load_config()

        # 2) Patch/merge øvrige felt (idempotent)
        passthrough = (
            "message_primary",
            "message_secondary",
            "show_message_primary",
            "show_message_secondary",
            "warn_minutes",
            "alert_minutes",
            "blink_seconds",
            "overrun_minutes",
            "admin_password",
            "daily_time",
            "once_at",
            "duration_minutes",
            "theme",
            "color_normal",
            "color_warn",
            "color_alert",
            "color_over",
            "show_target_time",
            "target_time_after",
            "messages_position",
            "use_blink",
            "use_phase_colors",
            "hms_threshold_minutes",
            "clock",
            "overlays",
        )
        patch = {k: data[k] for k in passthrough if k in data}
        if patch:
            cfg = save_config_patch(patch)

        tick = compute_tick(cfg)
        return _json_ok({"config": cfg, "tick": tick})

    except ValueError as e:
        # Valideringsfeil fra storage
        return _json_err(str(e), status=400, code="validation_error")
    except Exception:
        current_app.logger.exception("POST /api/config failed")
        return _json_err("internal error", status=500, code="internal_error")


# === Routes: duration controls =================================================


@bp.post("/start-duration")
@require_password
def api_start_duration() -> Response:
    if not _is_json_request():
        return _json_err(
            "expected application/json", status=415, code="unsupported_media_type"
        )

    data = request.get_json(silent=True) or {}
    minutes_raw = data.get("minutes", None)
    minutes = _coerce_positive_int(minutes_raw)

    if minutes is None:
        return _json_err(
            "'minutes' must be a positive integer", status=400, code="validation_error"
        )

    try:
        cfg = start_duration(minutes)
        tick = compute_tick(cfg)
        return _json_ok({"config": cfg, "tick": tick})
    except ValueError as e:
        return _json_err(str(e), status=400, code="validation_error")
    except Exception:
        current_app.logger.exception("POST /api/start-duration failed")
        return _json_err("internal error", status=500, code="internal_error")


@bp.post("/stop")
@require_password
def stop() -> Response:
    try:
        cfg = clear_duration_and_switch_to_daily()
        tick = compute_tick(cfg)
        return _json_ok({"config": cfg, "tick": tick})
    except Exception:
        current_app.logger.exception("POST /api/stop failed")
        return _json_err("internal error", status=500, code="internal_error")


@bp.get("/status")
def status() -> Response:
    try:
        cfg = load_config()
        return _json_ok(compute_tick(cfg))
    except Exception:
        current_app.logger.exception("GET /api/status failed")
        return _json_err("internal error", status=500, code="internal_error")


# === Local coercion helpers ====================================================


def _coerce_int_or_none(v: Any) -> int | None:
    if v in (None, ""):
        return None
    try:
        return int(v)
    except (TypeError, ValueError):
        return None


def _coerce_positive_int(v: Any) -> int | None:
    try:
        iv = int(v) if not (isinstance(v, str) and not v.strip()) else None
    except (TypeError, ValueError):
        iv = None
    if iv is None or iv <= 0:
        return None
    return iv
