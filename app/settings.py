# app/settings.py
"""
Grunninnstillinger (baner og TZ).
"""
from __future__ import annotations
from pathlib import Path
from zoneinfo import ZoneInfo

PROJECT_ROOT = Path(__file__).resolve().parents[1]
CONFIG_PATH = PROJECT_ROOT / "config.json"
TZ = ZoneInfo("Europe/Oslo")
