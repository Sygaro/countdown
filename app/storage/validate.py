from typing import Any, Dict, Tuple
from datetime import datetime

def validate_config(cfg: Dict[str, Any]) -> Tuple[bool, str]:
    """Sjekk at config er gyldig."""
    m = cfg.get("mode")
    if m not in ("daily", "once", "duration", "clock"):
        return False, "mode må være daily|once|duration|clock"

    if m == "daily":
        s = (cfg.get("daily_time") or "").strip()
        if len(s) != 5 or ":" not in s:
            return False, "daily_time må være HH:MM"

    if m == "once":
        s = (cfg.get("once_at") or "").strip()
        if s:
            ss = s.replace("Z", "+00:00")
            try:
                datetime.fromisoformat(ss)
            except Exception:
                return False, "once_at må være ISO-format"

    if m == "duration" and int(cfg.get("duration_minutes") or 0) <= 0:
        return False, "duration_minutes må være > 0"

    return True, ""


def clean_by_mode(cfg: Dict[str, Any]) -> Dict[str, Any]:
    """Nullstill felter avhengig av modus."""
    m = cfg.get("mode")
    if m == "daily":
        cfg["once_at"] = ""
        cfg["duration_started_ms"] = 0
    elif m == "once":
        cfg["duration_started_ms"] = 0
    elif m == "duration":
        cfg["once_at"] = ""
    elif m == "clock":
        cfg["once_at"] = ""
        cfg["duration_started_ms"] = 0
    return cfg
