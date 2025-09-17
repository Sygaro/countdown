# app/settings.py
"""
Grunninnstillinger (baner, tidssone, og config-sti).
"""
from __future__ import annotations
import os
from pathlib import Path
from zoneinfo import ZoneInfo

# Prosjektets rotmappe
PROJECT_ROOT = Path(__file__).resolve().parents[1]

# Sti til config.json (kan overstyres med ENV)
CONFIG_PATH = Path(os.environ.get("COUNTDOWN_CONFIG", PROJECT_ROOT / "config.json"))

# Tidssone (default: Europe/Oslo)
TZ = ZoneInfo(os.environ.get("COUNTDOWN_TZ", "Europe/Oslo"))

# Minimum keys som forventes i config (hjelper storage-moduler)
DEFAULT_CONFIG_KEYS = {
    "mode": "daily",
    "daily_time": "18:00",
    "once_at": None,
    "duration_minutes": "15",
    "message_primary": "Velkommen!",
    "message_secondary": "Vi starter kl:",
    "show_message_primary": True,
    "show_message_secondary": True,
    "overlays": [],
    "theme": {},
    "clock": {},
}
