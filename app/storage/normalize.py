from typing import Any, Dict
from .defaults import get_defaults
from .utils import clamp_float, safe_int

def coerce_config(cfg: Dict[str, Any]) -> Dict[str, Any]:
    """Normaliser og coerçe typer til forventet format."""

    for k in ("warn_minutes", "alert_minutes", "blink_seconds", "overrun_minutes",
              "duration_minutes", "duration_started_ms", "hms_threshold_minutes"):
        if k in cfg:
            cfg[k] = safe_int(cfg[k], get_defaults().get(k, 0))

    for k in ("message_primary", "message_secondary", "daily_time", "once_at"):
        if cfg.get(k) is None:
            cfg[k] = ""

    # Theme
    theme = get_defaults()["theme"]
    cfg["theme"] = {**theme, **cfg.get("theme", {})}

    # Digits
    dg = cfg["theme"].get("digits", {})
    dg["size_vw"] = max(8, min(40, safe_int(dg.get("size_vw"), 14)))
    cfg["theme"]["digits"] = dg

    # Clock
    clk = cfg.get("clock", {})
    clk["with_seconds"] = bool(clk.get("with_seconds", False))
    clk["use_clock_messages"] = bool(clk.get("use_clock_messages", False))
    clk["color"] = str(clk.get("color") or "#e6edf3")
    clk["size_vmin"] = max(6, min(30, safe_int(clk.get("size_vmin"), 12)))
    cfg["clock"] = clk

    # hms_threshold_minutes
    cfg["hms_threshold_minutes"] = max(0, min(720, cfg.get("hms_threshold_minutes", 60)))

    return cfg
