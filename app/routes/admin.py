# app/routes/admin.py
from __future__ import annotations
import time
from datetime import datetime, timedelta, time
from flask import Blueprint, request, jsonify, abort

from ..auth import require_password
from ..storage import load_config, save_config_patch, save_target_datetime
from ..countdown import derive_state
from ..sse import publish
from ..settings import TZ

bp = Blueprint("admin", __name__)

@bp.get("/config")
def get_config():
    cfg = load_config()
    state = derive_state(cfg)
    resp = jsonify({
        "ok": True,
        "config": cfg,
        "state": state,
        "server_time": datetime.now(TZ).isoformat(),
    })
    resp.headers["Cache-Control"] = "no-store"
    return resp

@bp.post("/config")
@require_password
def post_config():
    """
    Tar imot enten JSON eller form-data fra admin-siden og lagrer config.
    Tåler bools som "true/false", "on/off", "1/0".
    Returnerer alltid en ryddig JSON-respons (ikke 500).
    """
    import time
    from werkzeug.exceptions import BadRequest

    # 1) Hent payload (JSON -> fall back til form)
    data = request.get_json(silent=True)
    if data is None:
        data = request.form.to_dict(flat=True)

    if not isinstance(data, dict):
        raise BadRequest("Payload må være JSON-objekt eller form-data")

    # 2) Hjelpere for konvertering
    def to_bool(v):
        if isinstance(v, bool):
            return v
        if v is None:
            return None
        s = str(v).strip().lower()
        if s in ("1", "true", "on", "yes", "y"):
            return True
        if s in ("0", "false", "off", "no", "n"):
            return False
        return None  # ukjent -> blir ignorert nedenfor

    def to_int(v, *, field):
        if v in (None, ""):
            return None
        try:
            return int(v)
        except Exception:
            raise BadRequest(f"{field} må være heltall")

    # 3) Plukk ut og normaliser bare kjente felt
    allowed = {
        "message_primary",
        "message_secondary",
        "show_message_primary",
        "show_message_secondary",
        "warn_minutes",
        "alert_minutes",
    }
    patch = {}

    if "message_primary" in data:
        patch["message_primary"] = data["message_primary"]
    if "message_secondary" in data:
        patch["message_secondary"] = data["message_secondary"]

    if "show_message_primary" in data:
        b = to_bool(data["show_message_primary"])
        if b is not None:
            patch["show_message_primary"] = b
    if "show_message_secondary" in data:
        b = to_bool(data["show_message_secondary"])
        if b is not None:
            patch["show_message_secondary"] = b

    if "warn_minutes" in data:
        patch["warn_minutes"] = to_int(data["warn_minutes"], field="warn_minutes")
    if "alert_minutes" in data:
        patch["alert_minutes"] = to_int(data["alert_minutes"], field="alert_minutes")

    # 4) Lagre og svar
    try:
        cfg = save_config_patch(patch)  # din eksisterende lagrefunksjon
    except ValueError as e:
        # planlagte/valideringsfeil -> 400 med klar melding
        return jsonify({"ok": False, "error": str(e)}), 400
    except Exception as e:
        # uventet feil -> 500 med enkel melding (og logg i server)
        # (gunicorn logger stacktrace; vi returnerer en snill tekst til klienten)
        return jsonify({"ok": False, "error": "Kunne ikke lagre konfig."}), 500

    state = derive_state(cfg)
    publish({"type": "config_update", "ts": time.time(), "config": cfg, "state": state})
    return jsonify({"ok": True, "config": cfg, "state": state})

@bp.post("/start")
@require_password
def start_duration():
    """
    Start nedtelling nå med gitt varighet (i minutter).
    Body: { "minutes": 15 }  (eller minutes som streng/number)
    """
    data = request.get_json(silent=True) or {}
    minutes = data.get("minutes")

    try:
        minutes = int(minutes)
    except Exception:
        abort(400, "'minutes' må være et heltall")
    if minutes <= 0:
        abort(400, "'minutes' må være > 0'")

    now = datetime.now(TZ)
    target = now + timedelta(minutes=minutes)

    cfg = save_target_datetime(target)
    state = derive_state(cfg)

    # To små events: et lett "ping" + full state/config (helt fint å slå sammen også)
    publish({"type": "config_update", "ts": time.time()})
    publish({"type": "config_update", "config": cfg, "state": state})

    return jsonify({"ok": True, "config": cfg, "state": state})
