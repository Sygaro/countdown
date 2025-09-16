# app/storage/duration.py
"""
Håndtering av modus (daily, once, duration, clock).
Ansvar:
- Bytte modus på config
- Starte varighetsmodus (duration)
- Resette varighetsmodus tilbake til daily når den er ferdig
"""

from __future__ import annotations
import time
from typing import Any, Dict, Optional

from app.storage.config import load_config, save_config, save_config_patch


# --- Modus-håndtering ---

def set_mode(
    mode: str,
    *,
    daily_time: str = "",
    once_at: str = "",
    duration_minutes: Optional[int] = None,
) -> Dict[str, Any]:
    """
    Sett nytt modus i config.
    Støtter: daily, once, duration, clock.
    """
    cfg = get_config()
    mode = (mode or "").strip().lower()

    if mode not in {"daily", "once", "duration", "clock"}:
        raise ValueError(f"Ugyldig modus: {mode}")

    patch: Dict[str, Any] = {"mode": mode}

    if mode == "daily":
        if not daily_time:
            raise ValueError("daily_time må oppgis for daily-modus")
        patch["daily_time"] = daily_time
        patch["once_at"] = ""
        patch["duration_minutes"] = 0
        patch["duration_started_ms"] = 0

    elif mode == "once":
        if not once_at:
            raise ValueError("once_at må oppgis for once-modus")
        patch["once_at"] = once_at
        patch["daily_time"] = ""
        patch["duration_minutes"] = 0
        patch["duration_started_ms"] = 0

    elif mode == "duration":
        if not duration_minutes or duration_minutes <= 0:
            raise ValueError("duration_minutes må være > 0 for duration-modus")
        patch["duration_minutes"] = int(duration_minutes)
        patch["duration_started_ms"] = int(time.time() * 1000)
        patch["daily_time"] = ""
        patch["once_at"] = ""

    elif mode == "clock":
        patch["daily_time"] = ""
        patch["once_at"] = ""
        patch["duration_minutes"] = 0
        patch["duration_started_ms"] = 0

    cfg.update(patch)
    replace_config(cfg)
    return cfg


def start_duration(minutes: int) -> Dict[str, Any]:
    """
    Start varighetsmodus umiddelbart.
    """
    if minutes <= 0:
        raise ValueError("minutes må være > 0")

    now_ms = int(time.time() * 1000)
    patch = {
        "mode": "duration",
        "duration_minutes": int(minutes),
        "duration_started_ms": now_ms,
        "daily_time": "",
        "once_at": "",
    }
    return patch_config(patch)

def stop_duration() -> Dict[str, Any]:
    """
    Stopp varighetsmodus og gå tilbake til 'daily'.
    """
    cfg = get_config()
    cfg["mode"] = "daily"
    cfg["duration_minutes"] = 0
    cfg["duration_started_ms"] = 0
    replace_config(cfg)
    return cfg


def clear_duration_and_switch_to_daily() -> Dict[str, Any]:
    """
    Hvis duration er ferdig → sett tilbake til daily (fallback).
    """
    cfg = get_config()
    if cfg.get("mode") == "duration":
        if cfg.get("daily_time"):
            cfg["mode"] = "daily"
        else:
            cfg["mode"] = "clock"  # fallback hvis daily ikke finnes
        cfg["duration_minutes"] = 0
        cfg["duration_started_ms"] = 0
        replace_config(cfg)
    return cfg
