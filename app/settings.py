# app/settings.py
"""
Grunninnstillinger for appen (bane til config, timezone, mm.).
"""
from __future__ import annotations
from pathlib import Path
from zoneinfo import ZoneInfo

# Prosjektrot (…/countdown)
PROJECT_ROOT = Path(__file__).resolve().parents[1]

# Config-fil legges i prosjektroten (som før)
CONFIG_PATH = PROJECT_ROOT / "config.json"

# Tidsone
TZ = ZoneInfo("Europe/Oslo")
