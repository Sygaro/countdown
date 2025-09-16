from typing import Any, Dict
import time
from .io import load_config, replace_config
from .utils import deep_merge
from .defaults import get_defaults

def save_config_patch(patch: Dict[str, Any]) -> Dict[str, Any]:
    """Oppdater deler av config (patch)."""
    current = load_config()
    deep_merge(current, patch or {})
    return replace_config(current)


def set_mode(
    mode: str,
    *,
    daily_time: str = "",
    once_at: str = "",
    duration_minutes: int | None = None,
    clock: Dict[str, Any] | None = None,
) -> Dict[str, Any]:
    cfg = load_config()
    cfg["mode"] = mode
    if mode == "daily":
        if daily_time:
            cfg["daily_time"] = daily_time
        cfg["duration_started_ms"] = 0
        cfg["once_at"] = ""
    elif mode == "once":
        cfg["once_at"] = once_at or ""
        cfg["duration_started_ms"] = 0
    elif mode == "duration":
        if duration_minutes:
            cfg["duration_minutes"] = int(duration_minutes)
    elif mode == "clock":
        if clock:
            base = get_defaults()["clock"]
            cfg["clock"] = deep_merge(base, clock)
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
