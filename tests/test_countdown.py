# tests/test_countdown.py
import sys
from importlib import reload
from pathlib import Path
from datetime import datetime, timedelta

import pytest

# Sørg for at "app" kan importeres
ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import app.settings as settings

def fresh_module():
    import app.countdown as cd
    return reload(cd)

def test_running_warn_alert(monkeypatch):
    cd = fresh_module()
    base = 1_700_000_000_000  # ms
    # Konfig: mål om 10min, varsle 5, alert 2
    cfg = {
        "target_ms": base + 10*60_000,
        "warn_minutes": 5,
        "alert_minutes": 2,
        "overrun_minutes": 1,
        "blink_seconds": 10,
    }
    monkeypatch.setattr(cd, "_now_ms", lambda: base)
    t = cd.compute_tick(cfg)
    assert t["state"] == "running"
    assert t["mode"] == "normal"
    assert 9*60_000 <= t["display_ms"] <= 10*60_000

    # Rett før warn
    monkeypatch.setattr(cd, "_now_ms", lambda: base + 5*60_000 - 500)
    t = cd.compute_tick(cfg)
    assert t["mode"] == "warn"

    # Rett før alert
    monkeypatch.setattr(cd, "_now_ms", lambda: base + 8*60_000 - 500)
    t = cd.compute_tick(cfg)
    assert t["mode"] == "alert"
    assert t["blink"] is True

def test_overrun_and_ended(monkeypatch):
    cd = fresh_module()
    base = 1_700_000_000_000
    cfg = {
        "target_ms": base - 30_000,   # 30s siden
        "overrun_minutes": 1,
        "warn_minutes": 5,
        "alert_minutes": 2,
    }
    monkeypatch.setattr(cd, "_now_ms", lambda: base)
    t = cd.compute_tick(cfg)
    assert t["state"] in ("overrun", "over") or t["mode"] in ("over",)
    assert 29_000 <= t["display_ms"] <= 31_000

    # Etter overrun
    cfg["target_ms"] = base - 90_000  # 1m30s siden
    t = cd.compute_tick(cfg)
    assert t["state"] == "ended"
    assert t["display_ms"] == 0

def test_daily_time_today_tomorrow(monkeypatch):
    cd = fresh_module()
    # Nå: 2025-09-10 10:00 Europe/Oslo
    now_dt = datetime(2025, 9, 10, 10, 0, 0, tzinfo=settings.TZ)
    base = int(now_dt.timestamp() * 1000)

    cfg = {"daily_time": "10:30", "warn_minutes": 5, "alert_minutes": 2}
    monkeypatch.setattr(cd, "_now_ms", lambda: base)
    t = cd.compute_tick(cfg)
    assert t["target_hhmm"] == "10:30"
    assert 29*60_000 <= t["display_ms"] <= 30*60_000

    # Etter dagens tid: forvent i morgen
    now2 = int((now_dt.replace(hour=11, minute=0)).timestamp() * 1000)
    monkeypatch.setattr(cd, "_now_ms", lambda: now2)
    t2 = cd.compute_tick(cfg)
    # ~23h30min igjen
    assert 23*60*60*1000 <= t2["display_ms"] <= 24*60*60*1000

def test_iso_parsing_naive_uses_TZ(monkeypatch):
    cd = fresh_module()
    # 2025-09-10 10:30 i Oslo, naive ISO
    dt = datetime(2025, 9, 10, 10, 30, 0, tzinfo=settings.TZ)
    cfg = {"target_datetime": "2025-09-10T10:30:00", "warn_minutes": 5, "alert_minutes": 2}
    monkeypatch.setattr(cd, "_now_ms", lambda: int((dt - timedelta(minutes=10)).timestamp()*1000))
    t = cd.compute_tick(cfg)
    assert t["target_hhmm"] == "10:30"
    assert t["state"] == "running"
