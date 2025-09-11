# app/storage.py
"""
Lagring/lasting av config med eksplisitt 'mode'.

Skjema:
- mode: "daily" | "once" | "duration"
- daily_time: "HH:MM" (gjelder for mode=daily)
- once_at: ISO "YYYY-MM-DDTHH:MM" (gjelder for mode=once)
- duration_minutes: int (sist valgte varighet)
- duration_started_ms: int|0 (start-tid i epoch ms når duration er aktiv)
- admin_password, meldinger, varselverdier m.m. beholdes

Skriving er atomisk (tmp+rename). Vi fjerner/ignorerer legacy-felt:
target_ms / target_iso / target_datetime.
"""
from __future__ import annotations

import json
import os
import tempfile
import time
from typing import Any, Dict, Tuple

from .settings import CONFIG_PATH, TZ
from datetime import datetime


_DEFAULTS: Dict[str, Any] = {
    "mode": "daily",                # "daily" | "once" | "duration"
    "daily_time": "20:00",          # HH:MM
    "once_at": "",                  # ISO-tidspunkt uten sekunder
    "duration_minutes": 10,
    "duration_started_ms": 0,       # 0 betyr inaktiv
    # Meldinger:
    "message_primary": "",
    "message_secondary": "",
    "show_message_primary": True,
    "show_message_secondary": False,
    # Varsler/blink:
    "warn_minutes": 3,
    "alert_minutes": 1,
    "blink_seconds": 15,
    "overrun_minutes": 5,
    # Admin:
    "admin_password": None,
}

_LEGACY_KEYS = {"target_ms", "target_iso", "target_datetime"}


def get_config_path() -> os.PathLike:
    return CONFIG_PATH


def _atomic_write_json(path, data: Dict[str, Any]) -> None:
    # Hvorfor: sikre mot korrupte filer ved strømbrudd/crash.
    d = os.path.dirname(path)
    os.makedirs(d, exist_ok=True)
    fd, tmp = tempfile.mkstemp(prefix=".config.", dir=d)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2, sort_keys=True)
            f.write("\n")
        os.replace(tmp, path)
    finally:
        try:
            if os.path.exists(tmp):
                os.unlink(tmp)
        except Exception:
            pass


def _strip_legacy_keys(cfg: Dict[str, Any]) -> Dict[str, Any]:
    for k in list(cfg.keys()):
        if k in _LEGACY_KEYS:
            cfg.pop(k, None)
    return cfg


def _coerce_types(cfg: Dict[str, Any]) -> Dict[str, Any]:
    # Skånsom normalisering for b/bool-int-str-miks fra UI/JSON.
    def _b(v):
        if isinstance(v, bool):
            return v
        if v is None:
            return None
        s = str(v).strip().lower()
        if s in ("1", "true", "on", "yes", "y"):
            return True
        if s in ("0", "false", "off", "no", "n"):
            return False
        return None

    def _i(v, default=None):
        if v in (None, ""):
            return default
        try:
            return int(v)
        except Exception:
            return default

    cfg["show_message_primary"]  = _b(cfg.get("show_message_primary")) if "show_message_primary" in cfg else _DEFAULTS["show_message_primary"]
    cfg["show_message_secondary"]= _b(cfg.get("show_message_secondary")) if "show_message_secondary" in cfg else _DEFAULTS["show_message_secondary"]
    cfg["warn_minutes"]          = _i(cfg.get("warn_minutes"), _DEFAULTS["warn_minutes"])
    cfg["alert_minutes"]         = _i(cfg.get("alert_minutes"), _DEFAULTS["alert_minutes"])
    cfg["blink_seconds"]         = _i(cfg.get("blink_seconds"), _DEFAULTS["blink_seconds"])
    cfg["overrun_minutes"]       = _i(cfg.get("overrun_minutes"), _DEFAULTS["overrun_minutes"])
    cfg["duration_minutes"]      = _i(cfg.get("duration_minutes"), _DEFAULTS["duration_minutes"])
    cfg["duration_started_ms"]   = _i(cfg.get("duration_started_ms"), 0) or 0
    # Strings som kan være None:
    for key in ("message_primary", "message_secondary", "daily_time", "once_at"):
        if key in cfg and cfg[key] is None:
            cfg[key] = ""
    return cfg


def _validate(cfg: Dict[str, Any]) -> Tuple[bool, str]:
    mode = cfg.get("mode")
    if mode not in ("daily", "once", "duration"):
        return False, "mode må være 'daily', 'once' eller 'duration'"
    if mode == "daily":
        hhmm = (cfg.get("daily_time") or "").strip()
        if len(hhmm) != 5 or ":" not in hhmm:
            return False, "daily_time må være 'HH:MM'"
    if mode == "once":
        s = (cfg.get("once_at") or "").strip()
        try:
            if s:
                dt = datetime.fromisoformat(s)
                if dt.tzinfo is None:
                    # Why: sikre entydig TZ
                    dt = dt.replace(tzinfo=TZ)
        except Exception:
            return False, "once_at må være gyldig ISO-tid (YYYY-MM-DDTHH:MM)"
    if mode == "duration":
        mins = int(cfg.get("duration_minutes") or 0)
        if mins <= 0:
            return False, "duration_minutes må være > 0"
    return True, ""


def _apply_mode_cleanups(cfg: Dict[str, Any]) -> Dict[str, Any]:
    # Why: hold config ren og entydig for valgt modus.
    m = cfg.get("mode")
    if m == "daily":
        cfg["once_at"] = ""
        cfg["duration_started_ms"] = 0
    elif m == "once":
        cfg["duration_started_ms"] = 0
    elif m == "duration":
        cfg["once_at"] = ""
    return cfg


def _merge_defaults(cfg: Dict[str, Any]) -> Dict[str, Any]:
    merged = dict(_DEFAULTS)
    merged.update(cfg or {})
    return merged


def load_config() -> Dict[str, Any]:
    path = str(CONFIG_PATH)
    if not os.path.exists(path):
        cfg = _merge_defaults({})
        _atomic_write_json(path, cfg)
        return cfg
    try:
        with open(path, "r", encoding="utf-8") as f:
            cfg = json.load(f)
    except Exception:
        # Why: aldri stopp appen på korrupt fil — start med defaults.
        cfg = {}
    cfg = _merge_defaults(_strip_legacy_keys(cfg))
    cfg = _coerce_types(cfg)
    ok, msg = _validate(cfg)
    if not ok:
        # Legg til minst mulig for å være kjørbar
        cfg = _merge_defaults(cfg)
    return _apply_mode_cleanups(cfg)


def replace_config(new_config: Dict[str, Any]) -> Dict[str, Any]:
    cfg = _merge_defaults(_strip_legacy_keys(new_config))
    cfg = _coerce_types(cfg)
    ok, msg = _validate(cfg)
    if not ok:
        raise ValueError(msg)
    cfg["_updated_at"] = int(time.time())
    cfg = _apply_mode_cleanups(cfg)
    _atomic_write_json(str(CONFIG_PATH), cfg)
    return cfg


def save_config_patch(patch: Dict[str, Any]) -> Dict[str, Any]:
    current = load_config()
    merged = dict(current)
    merged.update(patch or {})
    return replace_config(merged)


def set_mode(mode: str, *, daily_time: str = "", once_at: str = "", duration_minutes: int | None = None) -> Dict[str, Any]:
    cfg = load_config()
    cfg["mode"] = mode
    if mode == "daily":
        if daily_time:
            cfg["daily_time"] = daily_time
        cfg["duration_started_ms"] = 0
        cfg["once_at"] = ""
    elif mode == "once":
        if once_at is not None:
            cfg["once_at"] = once_at
        cfg["duration_started_ms"] = 0
    elif mode == "duration":
        if duration_minutes:
            cfg["duration_minutes"] = int(duration_minutes)
        # start ikke her — bruk start_duration()
    else:
        raise ValueError("Ugyldig mode")
    return replace_config(cfg)


def start_duration(minutes: int) -> Dict[str, Any]:
    if minutes <= 0:
        raise ValueError("minutes må være > 0")
    now_ms = int(time.time() * 1000)
    cfg = load_config()
    cfg["mode"] = "duration"
    cfg["duration_minutes"] = int(minutes)
    cfg["duration_started_ms"] = now_ms
    cfg["once_at"] = ""
    return replace_config(cfg)


def clear_duration_and_switch_to_daily() -> Dict[str, Any]:
    cfg = load_config()
    cfg["duration_started_ms"] = 0
    cfg["mode"] = "daily"
    # behold daily_time slik det står
    return replace_config(cfg)
