# tests/test_modes.py
"""
Enkle, raske tester av kjerne-logikk.
"""
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from app.countdown import compute_target_ms
TZ = ZoneInfo("Europe/Oslo")


def test_daily_overrun_window():
    now = datetime(2025, 9, 14, 9, 1, tzinfo=TZ)
    cfg = {"mode": "daily", "daily_time": "09:00", "overrun_minutes": 2}
    target = compute_target_ms(cfg, now_ms=int(now.timestamp()*1000))
    assert datetime.fromtimestamp(target/1000, tz=TZ).hour == 9


def test_daily_rollover_after_overrun():
    now = datetime(2025, 9, 14, 9, 3, tzinfo=TZ)  # >2 min etter 09:00
    cfg = {"mode": "daily", "daily_time": "09:00", "overrun_minutes": 2}
    target = compute_target_ms(cfg, now_ms=int(now.timestamp()*1000))
    # neste dag 09:00
    assert datetime.fromtimestamp(target/1000, tz=TZ).day == 15


def test_once_future_exact():
    now = datetime(2025, 9, 14, 12, 0, tzinfo=TZ)
    once = now + timedelta(minutes=30)
    cfg = {"mode": "once", "once_at": once.isoformat()}
    target = compute_target_ms(cfg, now_ms=int(now.timestamp()*1000))
    assert target == int(once.timestamp()*1000)


def test_duration_10min():
    now = datetime(2025, 9, 14, 12, 0, tzinfo=TZ)
    start_ms = int(now.timestamp()*1000)
    cfg = {"mode": "duration", "duration_minutes": 10, "duration_started_ms": start_ms}
    target = compute_target_ms(cfg, now_ms=start_ms)
    assert target == start_ms + 10*60_000
