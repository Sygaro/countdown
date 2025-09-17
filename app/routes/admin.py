# app/routes/admin.py
"""
Admin-API for config og modus-kontroll (herdet).
Skriver kun når det er reelle endringer; avviser tom/ugyldig JSON.
"""
from __future__ import annotations

from datetime import datetime
from copy import deepcopy
from typing import Any, Dict, Tuple

from flask import Blueprint, request, jsonify, abort
from werkzeug.exceptions import BadRequest

from ..auth import require_password
from ..storage.api import get_config, replace_config  # patch_config ikke brukt
from ..storage.duration import (
    set_mode,
    start_duration,
    clear_duration_and_switch_to_daily,
)
from ..storage.defaults import get_defaults
from ..storage.normalize import coerce_config
from ..storage.validate import validate_config, clean_by_mode
from ..storage.overlays import sanitize_overlays
from ..storage.utils import deep_merge
from ..countdown import compute_tick
from ..settings import TZ, CONFIG_PATH

bp = Blueprint("admin", __name__)


# ---------- utils ----------
def _flatten(obj: Any, prefix: str = "") -> Dict[str, Any]:
    out = {}
    if isinstance(obj, dict):
        for k, v in obj.items():
            p = f"{prefix}.{k}" if prefix else str(k)
            out.update(_flatten(v, p))
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            p = f"{prefix}[{i}]"
            out.update(_flatten(v, p))
    else:
        out[prefix] = obj
    return out


def _deep_diff(a: Any, b: Any, path: str = "") -> Tuple[list, list, list]:
    added, removed, changed = [], [], []
    if isinstance(a, dict) and isinstance(b, dict):
        akeys, bkeys = set(a.keys()), set(b.keys())
        for k in sorted(bkeys - akeys):
            added.append(f"{path}.{k}".strip("."))
        for k in sorted(akeys - bkeys):
            removed.append(f"{path}.{k}".strip("."))
        for k in sorted(akeys & bkeys):
            sub = f"{path}.{k}".strip(".")
            a_v, b_v = a[k], b[k]
            if isinstance(a_v, dict) and isinstance(b_v, dict):
                a2, r2, c2 = _deep_diff(a_v, b_v, sub)
                added += a2
                removed += r2
                changed += c2
            elif isinstance(a_v, list) and isinstance(b_v, list):
                if a_v != b_v:
                    changed.append(sub)
            else:
                if a_v != b_v:
                    changed.append(sub)
    else:
        if a != b:
            changed.append(path)
    return added, removed, changed


def _read_json_body() -> Dict[str, Any]:
    if not request.is_json:
        abort(400, description="Content-Type må være application/json")
    try:
        data = request.get_json(silent=False)
    except BadRequest:
        abort(400, description="Ugyldig JSON i forespørselen")
    if not isinstance(data, dict):
        abort(400, description="Payload må være et JSON-objekt")
    if not data:
        abort(400, description="Tom payload – ingen endringer å lagre")
    if "_meta" in data:
        # _meta styres av backend
        del data["_meta"]
    return data


def _simulate_pipeline(current: Dict[str, Any], patch: Dict[str, Any]) -> Dict[str, Any]:
    """
    Simulerer endelig config som ville blitt skrevet:
    defaults <- (current + patch) -> sanitize -> coerce -> validate -> clean_by_mode -> _meta
    """
    merged = deepcopy(current)
    for k, v in (patch or {}).items():
        merged[k] = v

    defaults = get_defaults()
    cfg_in = deep_merge(defaults, merged)

    if "overlays" in cfg_in:
        cfg_in["overlays"] = sanitize_overlays(cfg_in.get("overlays"))

    cfg = coerce_config(cfg_in)
    ok, msg = validate_config(cfg)
    if not ok:
        raise ValueError(msg)

    cfg = clean_by_mode(cfg)
    meta = dict(cfg.get("_meta") or {})
    meta.setdefault("version", 1)
    cfg["_meta"] = meta
    return cfg


# ---------- routes ----------
@bp.get("/config")
def get_config_route():
    cfg = get_config()
    t = compute_tick(cfg)
    return (
        jsonify(
            {
                "ok": True,
                "config": cfg,
                "tick": t,
                "server_time": datetime.now(TZ).isoformat(),
                "__config_path": str(CONFIG_PATH),
            }
        ),
        200,
    )


@bp.post("/config")
@require_password
def post_config():
    """
    Lagrer innstillinger OG/ELLER bytter modus.
    Debug:
      - X-Debug: 1  → inkluderer diff/dropped_keys
      - X-Dry-Run: 1 → simuler uten skriving
    """
    # --- krev ekte JSON-objekt ---
    if not request.is_json:
        abort(400, description="Content-Type må være application/json")
    try:
        payload = request.get_json(silent=False)
    except Exception:
        abort(400, description="Ugyldig JSON i forespørselen")
    if not isinstance(payload, dict) or not payload:
        abort(400, description="Payload må være et ikke-tomt JSON-objekt")

    # rydd vekk felt vi *aldri* aksepterer direkte
    payload.pop("_meta", None)

    debug = request.headers.get("X-Debug") == "1"
    dry_run = request.headers.get("X-Dry-Run") == "1"

    cfg_before = get_config()  # eksisterende konfig

    # 1) Domenelogikk for modus (valgfritt)
    cfg_after_mode = deepcopy(cfg_before)
    if "mode" in payload:
        mode = str(payload.get("mode", "")).strip().lower()
        daily_time = str(payload.get("daily_time") or "")
        once_at = str(payload.get("once_at") or "")
        dm = payload.get("duration_minutes")
        duration_minutes = int(dm) if dm not in (None, "") else None
        try:
            cfg_after_mode = set_mode(
                mode,
                daily_time=daily_time,
                once_at=once_at,
                duration_minutes=duration_minutes,
            )
        except ValueError as e:
            return jsonify({"ok": False, "error": str(e)}), 400

    # 2) Full patch (ikke allow-list). Unngå å overskrive 'mode' direkte.
    patch = {k: v for k, v in payload.items() if k != "mode"}

    # 3) Simuler sluttresultat (samme pipeline som IO-laget)
    try:
        simulated = _simulate_pipeline(cfg_after_mode, patch)
    except ValueError as e:
        return jsonify({"ok": False, "error": str(e)}), 400

    # 4) Persist (alltid, når ikke dry-run)
    if dry_run:
        cfg_after = simulated
        wrote = False
    else:
        cfg_after = replace_config(simulated)  # atomisk write
        wrote = (cfg_after != cfg_before)

    # 5) Debug-info (valgfritt)
    base = {"ok": True, "config": cfg_after, "tick": compute_tick(cfg_after)}
    if debug:
        added, removed, changed = _deep_diff(cfg_before, simulated)
        flat_patch = _flatten(patch)
        flat_after = _flatten(simulated)
        dropped_keys = sorted([k for k in flat_patch.keys() if k not in flat_after])
        base["debug"] = {
            "dry_run": dry_run,
            "wrote": wrote,
            "diff": {"added": added, "removed": removed, "changed": changed},
            "dropped_keys": dropped_keys,
            "would_write": simulated if dry_run else None,
        }

    return jsonify(base), 200




@bp.post("/start-duration")
@require_password
def post_start_duration():
    data = _read_json_body()
    raw_minutes = data.get("minutes")
    try:
        minutes = int(str(raw_minutes).strip())
    except Exception:
        abort(400, "minutes må være et heltall")
    if minutes <= 0:
        abort(400, "minutes må være > 0")

    cfg = start_duration(minutes)
    t = compute_tick(cfg)
    return jsonify({"ok": True, "config": cfg, "tick": t}), 200


@bp.post("/stop-duration")
@require_password
def stop_duration_route():
    cfg = clear_duration_and_switch_to_daily()
    t = compute_tick(cfg)
    return jsonify({"ok": True, "config": cfg, "tick": t}), 200
