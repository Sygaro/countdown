# tests/test_mode.py
"""
Pytest: valider eksplisitt modus.
"""
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from app.countdown import compute_target_ms
TZ = ZoneInfo("Europe/Oslo")

def test_daily_next_occurrence():
    now = datetime(2025, 9, 11, 20, 30, tzinfo=TZ)
    cfg = {"mode": "daily", "daily_time": "20:00"}
    target = compute_target_ms(cfg, now_ms=int(now.timestamp()*1000))
    assert datetime.fromtimestamp(target/1000, tz=TZ).hour == 20

def test_once_future():
    now = datetime(2025, 9, 11, 12, 0, tzinfo=TZ)
    once = now + timedelta(hours=2)
    cfg = {"mode": "once", "once_at": once.isoformat()}
    target = compute_target_ms(cfg, now_ms=int(now.timestamp()*1000))
    assert target == int(once.timestamp()*1000)

def test_duration_active():
    now = datetime(2025, 9, 11, 12, 0, tzinfo=TZ)
    cfg = {"mode": "duration", "duration_minutes": 10, "duration_started_ms": int(now.timestamp()*1000)}
    target = compute_target_ms(cfg, now_ms=int(now.timestamp()*1000))
    assert target == int((now + timedelta(minutes=10)).timestamp()*1000)
