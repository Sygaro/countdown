# app/settings.py
from __future__ import annotations
import os
from pathlib import Path
from zoneinfo import ZoneInfo

# Hvorfor: én felles rot og entydig CONFIG_PATH
PROJECT_ROOT = Path(__file__).resolve().parents[1]
STATIC_DIR = PROJECT_ROOT / "static"

# Sett COUNTDOWN_CONFIG i miljøet hvis du MÅ overstyre; ellers bruk <repo>/config.json
CONFIG_PATH = Path(os.environ.get("COUNTDOWN_CONFIG") or (PROJECT_ROOT / "config.json")).resolve()

# Lokal tidssone for visning/pars­ing av naive ISO-tider
TZ = ZoneInfo(os.environ.get("COUNTDOWN_TZ") or "Europe/Oslo")
