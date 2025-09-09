from __future__ import annotations
from pathlib import Path
from zoneinfo import ZoneInfo

APP_DIR = Path(__file__).resolve().parents[1]
STATIC_DIR = APP_DIR / "static"
CONFIG_PATH = APP_DIR / "config.json"

TZ = ZoneInfo("Europe/Oslo")
SSE_KEEPALIVE_SECONDS = 20
