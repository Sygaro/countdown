from typing import Any, Dict
from .defaults import get_defaults
from .utils import safe_int
import re

_COLOR_HEX_RE = re.compile(r"^#[0-9a-f]{6}$")


def coerce_config(cfg: Dict[str, Any]) -> Dict[str, Any]:
    """Normaliser og coerçe typer til forventet format."""

    for k in (
        "warn_minutes",
        "alert_minutes",
        "blink_seconds",
        "overrun_minutes",
        "duration_minutes",
        "duration_started_ms",
        "hms_threshold_minutes",
    ):
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
    cfg["hms_threshold_minutes"] = max(
        0, min(720, cfg.get("hms_threshold_minutes", 60))
    )
    cfg = canonicalize_theme_colors(cfg)

    return cfg


# --- fargehelpers: gyldig hex og koersing ------------------------------------


def coerce_color(value):
    """
    Tar imot 'abc', '#abc', 'aabbcc', '#aabbcc' og returnerer '#aabbcc'.
    Kaster ValueError ved ugyldig input.
    """
    if not isinstance(value, str):
        raise ValueError("color must be a string")

    v = value.strip().lower()
    if v.startswith("#"):
        v = v[1:]

    if len(v) == 3 and all(ch in "0123456789abcdef" for ch in v):
        v = "".join(ch * 2 for ch in v)

    if len(v) != 6 or not all(ch in "0123456789abcdef" for ch in v):
        raise ValueError(f"invalid hex color: {value!r}")

    return f"#{v}"


def canonicalize_theme_colors(cfg: dict) -> dict:
    """
    Gjør theme.colors til canonical:
    - Sørger for at cfg['theme']['colors'] finnes
    - Mapper toppnivå color_* inn i theme.colors hvis de finnes
    - Koerster farger til hex
    - Fjerner toppnivå color_* fra cfg
    """
    theme = cfg.get("theme")
    if not isinstance(theme, dict):
        theme = {}
        cfg["theme"] = theme

    colors = theme.get("colors")
    if not isinstance(colors, dict):
        colors = {}
        theme["colors"] = colors

    # Flytt fra toppnivå dersom de finnes
    legacy_map = {
        "color_normal": "normal",
        "color_warn": "warn",
        "color_alert": "alert",
        "color_over": "over",
    }
    for legacy_key, new_key in legacy_map.items():
        if legacy_key in cfg and cfg[legacy_key] is not None:
            colors[new_key] = cfg[legacy_key]

    # Koersing til '#rrggbb' eller dropp ved ugyldig
    for k in ("normal", "warn", "alert", "over"):
        if k in colors and colors[k] is not None:
            try:
                colors[k] = coerce_color(colors[k])
            except Exception:
                colors.pop(k, None)

    # Fjern toppnivå-legacy etter migrering
    for legacy_key in list(legacy_map.keys()):
        cfg.pop(legacy_key, None)

    return cfg
