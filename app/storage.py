# app/storage.py
"""
Config I/O med eksplisitt mode inkl. 'screen'. Atomisk skriving og validering.
Nye felt: visningsvalg (mål-klokkeslett, plassering, farger, blink, hms-terskel).
"""
from __future__ import annotations

import json
import os
import tempfile
import time
from typing import Any, Dict, Tuple
from datetime import datetime
from .settings import CONFIG_PATH, TZ

_DEFAULTS: Dict[str, Any] = {
    "mode": "daily",                 # daily | once | duration | screen
    "daily_time": "20:00",
    "once_at": "",
    "duration_minutes": 10,
    "duration_started_ms": 0,

    # Stopp-skjerm
    "screen": {
        "type": "text",              # text | image | blackout
        "text": "Pause",
        "text_color": "#ffffff",
        "bg": "#000000",
        "font_vh": 10,
        "image_url": "",
        "image_opacity": 100,        # 0..100
        "image_fit": "cover",        # cover | contain
    },

    # Meldinger (innhold)
    "message_primary": "",
    "message_secondary": "",
    "show_message_primary": True,
    "show_message_secondary": False,

    # Varsler/blink (logikk)
    "warn_minutes": 4,
    "alert_minutes": 2,
    "blink_seconds": 10,
    "overrun_minutes": 1,

    # Visningsvalg (utseende/oppførsel)
    "show_target_time": False,            # vis mål-klokkeslett
    "target_time_after": "secondary",     # "primary" | "secondary"
    "messages_position": "below",         # "above" | "below"
    "use_blink": True,                    # benytt blink i sluttsekunder
    "use_phase_colors": False,            # fargelegg digits etter fase
    "color_normal": "#e6edf3",
    "color_warn":   "#ffd166",
    "color_alert":  "#ff6b6b",
    "hms_threshold_minutes": 60,          # >60 min -> vis H:MM:SS

    # Admin
    "admin_password": None,
}
_LEGACY = {"target_ms", "target_iso", "target_datetime"}

def _atomic_write(path: str, data: Dict[str, Any]) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    fd, tmp = tempfile.mkstemp(prefix=".config.", dir=os.path.dirname(path))
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

def _deep_merge(dst: Dict[str, Any], src: Dict[str, Any]) -> Dict[str, Any]:
    for k, v in (src or {}).items():
        if isinstance(v, dict) and isinstance(dst.get(k), dict):
            _deep_merge(dst[k], v)
        else:
            dst[k] = v
    return dst

def _merge_defaults(cfg: Dict[str, Any]) -> Dict[str, Any]:
    merged = json.loads(json.dumps(_DEFAULTS))
    return _deep_merge(merged, cfg or {})

def _strip_legacy(cfg: Dict[str, Any]) -> Dict[str, Any]:
    for k in list(cfg.keys()):
        if k in _LEGACY:
            cfg.pop(k, None)
    return cfg

def _coerce_bool(v, default: bool) -> bool:
    if isinstance(v, bool):
        return v
    if isinstance(v, str):
        s = v.strip().lower()
        if s in ("1","true","yes","y","on"): return True
        if s in ("0","false","no","n","off"): return False
    return default

def _coerce(cfg: Dict[str, Any]) -> Dict[str, Any]:
    def _i(v, d=None):
        if v in (None, ""): return d
        try: return int(v)
        except Exception: return d

    for k in ("warn_minutes","alert_minutes","blink_seconds","overrun_minutes",
              "duration_minutes","duration_started_ms","hms_threshold_minutes"):
        if k in cfg: cfg[k] = _i(cfg[k], _DEFAULTS.get(k, 0))

    # Meldinger / tider
    for k in ("message_primary","message_secondary","daily_time","once_at"):
        if cfg.get(k) is None: cfg[k] = ""

    # Booleans
    for k, d in (
        ("show_message_primary", _DEFAULTS["show_message_primary"]),
        ("show_message_secondary", _DEFAULTS["show_message_secondary"]),
        ("show_target_time", _DEFAULTS["show_target_time"]),
        ("use_blink", _DEFAULTS["use_blink"]),
        ("use_phase_colors", _DEFAULTS["use_phase_colors"]),
    ):
        if k in cfg: cfg[k] = _coerce_bool(cfg[k], d)
        else: cfg[k] = d

    # Valgfrie str
    for k in ("target_time_after","messages_position","color_normal","color_warn","color_alert"):
        v = cfg.get(k)
        if v is None: cfg[k] = _DEFAULTS[k]

    # Screen
    sc = cfg.get("screen") or {}
    sc_defaults = _DEFAULTS["screen"]
    merged = json.loads(json.dumps(sc_defaults))
    _deep_merge(merged, sc)
    merged["font_vh"] = _i(merged.get("font_vh"), sc_defaults["font_vh"])
    merged["image_opacity"] = max(0, min(100, _i(merged.get("image_opacity"), sc_defaults["image_opacity"])))
    cfg["screen"] = merged
    return cfg

def _validate(cfg: Dict[str, Any]) -> Tuple[bool, str]:
    m = cfg.get("mode")
    if m not in ("daily","once","duration","screen"):
        return False, "mode må være daily|once|duration|screen"
    if m == "daily":
        s = (cfg.get("daily_time") or "").strip()
        if len(s) != 5 or ":" not in s:
            return False, "daily_time må være HH:MM"
    if m == "once":
        s = (cfg.get("once_at") or "").strip()
        if s:
            try:
                dt = datetime.fromisoformat(s)
                if dt.tzinfo is None:
                    dt = dt.replace(tzinfo=TZ)
            except Exception:
                return False, "once_at må være ISO (YYYY-MM-DDTHH:MM)"
    if m == "duration":
        if int(cfg.get("duration_minutes") or 0) <= 0:
            return False, "duration_minutes må være > 0"
    if m == "screen":
        sc = cfg.get("screen") or {}
        if sc.get("type") not in ("text","image","blackout"):
            return False, "screen.type må være text|image|blackout"
        if sc.get("type") == "image" and not (sc.get("image_url") or "").strip():
            return False, "screen.image_url må settes for image"
    return True, ""

def _clean_by_mode(cfg: Dict[str, Any]) -> Dict[str, Any]:
    m = cfg.get("mode")
    if m == "daily":
        cfg["once_at"] = ""
        cfg["duration_started_ms"] = 0
    elif m == "once":
        cfg["duration_started_ms"] = 0
    elif m == "duration":
        cfg["once_at"] = ""
    elif m == "screen":
        cfg["once_at"] = ""
        cfg["duration_started_ms"] = 0
    return cfg

def load_config() -> Dict[str, Any]:
    path = str(CONFIG_PATH)
    if not os.path.exists(path):
        cfg = _merge_defaults({})
        _atomic_write(path, cfg)
        return cfg
    try:
        with open(path, "r", encoding="utf-8") as f:
            cfg = json.load(f)
    except Exception:
        cfg = {}
    cfg = _merge_defaults(_strip_legacy(cfg))
    cfg = _coerce(cfg)
    ok, _ = _validate(cfg)
    if not ok:
        cfg = _merge_defaults(cfg)
    return _clean_by_mode(cfg)

def replace_config(new_cfg: Dict[str, Any]) -> Dict[str, Any]:
    cfg = _merge_defaults(_strip_legacy(new_cfg))
    cfg = _coerce(cfg)
    ok, msg = _validate(cfg)
    if not ok:
        raise ValueError(msg)
    cfg["_updated_at"] = int(time.time())
    cfg = _clean_by_mode(cfg)
    _atomic_write(str(CONFIG_PATH), cfg)
    return cfg

def save_config_patch(patch: Dict[str, Any]) -> Dict[str, Any]:
    current = load_config()
    merged = _merge_defaults(current)
    _deep_merge(merged, patch or {})
    return replace_config(merged)

def set_mode(mode: str, *, daily_time: str = "", once_at: str = "", duration_minutes: int | None = None, screen: Dict[str, Any] | None = None) -> Dict[str, Any]:
    cfg = load_config()
    cfg["mode"] = mode
    if mode == "daily":
        if daily_time: cfg["daily_time"] = daily_time
        cfg["duration_started_ms"] = 0; cfg["once_at"] = ""
    elif mode == "once":
        cfg["once_at"] = once_at or ""
        cfg["duration_started_ms"] = 0
    elif mode == "duration":
        if duration_minutes:
            cfg["duration_minutes"] = int(duration_minutes)
    elif mode == "screen":
        if screen:
            base = _merge_defaults({"screen": {}})["screen"]
            cfg["screen"] = base
            _deep_merge(cfg["screen"], screen)
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
    return replace_config(cfg)
