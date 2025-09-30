# tests/test_countdown_core.py
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Dict, Any

import app.countdown as countdown


def ms(minutes: float) -> int:
    return int(round(minutes * 60_000))


def fixed_now_ms(dt: datetime) -> int:
    return int(dt.timestamp() * 1000)


def base_cfg(**overrides: Any) -> Dict[str, Any]:
    cfg: Dict[str, Any] = {
        "mode": "daily",
        "daily_time": "09:00",
        "overrun_minutes": 2,
        "warn_minutes": 4,
        "alert_minutes": 2,
        "blink_seconds": 10,
    }
    cfg.update(overrides)
    return cfg


def test_clock_mode_returns_zero() -> None:
    cfg = base_cfg(mode="clock")
    t = countdown.compute_tick(cfg)
    assert t["state"] == "clock"
    assert t["display_ms"] == 0
    assert t.get("target_ms", 0) == 0
    assert t.get("blink", False) is False


def test_compute_target_ms_daily_future_and_past() -> None:
    tz = countdown.TZ
    today_0800 = datetime.now(tz).replace(hour=8, minute=0, second=0, microsecond=0)
    now_ms = fixed_now_ms(today_0800)

    # Future: 09:00 i dag
    cfg = base_cfg(mode="daily", daily_time="09:00")
    target = countdown.compute_target_ms(cfg, now_ms=now_ms)
    assert target > now_ms

    # Past: 07:30 -> din implementasjon beregner neste relevante target (> now)
    cfg2 = base_cfg(mode="daily", daily_time="07:30")
    target2 = countdown.compute_target_ms(cfg2, now_ms=now_ms)
    assert target2 > now_ms


def test_once_isoformat_future_and_past() -> None:
    tz = countdown.TZ
    now = datetime.now(tz).replace(second=0, microsecond=0)
    in_10_min = now + timedelta(minutes=10)
    ten_min_ago = now - timedelta(minutes=10)

    # Future ISO
    cfg_fut = base_cfg(mode="once", once_at=in_10_min.isoformat())
    target_fut = countdown.compute_target_ms(cfg_fut, now_ms=fixed_now_ms(now))
    assert target_fut == fixed_now_ms(in_10_min)

    # Past ISO -> compute_tick rapporterer "ended"
    cfg_past = base_cfg(mode="once", once_at=ten_min_ago.isoformat())
    t = countdown.compute_tick(cfg_past)
    assert t["state"] in ("ended", "clock")  # din kode gir "ended"
    assert t["state"] == "ended"


def test_duration_mode_target() -> None:
    now_ms = fixed_now_ms(datetime.now(timezone.utc))
    start_ms = now_ms - ms(5)
    cfg = base_cfg(mode="duration", duration_started_ms=start_ms, duration_minutes=15)
    target = countdown.compute_target_ms(cfg, now_ms=now_ms)
    assert target == start_ms + ms(15)


def test_tick_warn_and_alert_thresholds(monkeypatch) -> None:
    tz = countdown.TZ
    base = datetime.now(tz).replace(second=0, microsecond=0)
    now_ms = fixed_now_ms(base)
    target_ms = now_ms + ms(5)  # fem minutter frem

    # Gjør tiden deterministisk
    monkeypatch.setattr(countdown, "_now_ms", lambda: now_ms)

    cfg = base_cfg(
        mode="once",
        once_at=(base + timedelta(minutes=5)).isoformat(),
        warn_minutes=4,
        alert_minutes=2,
        blink_seconds=10,
    )
    t = countdown.compute_tick(cfg)
    assert t["state"] == "countdown"
    assert t["display_ms"] == target_ms - now_ms
    assert t["warn_ms"] == ms(4)
    assert t["alert_ms"] == ms(2)
    assert t["mode"] == "normal"
    assert t.get("blink", False) is False  # ikke i blink-vinduet ennå

    # 3 min før -> "warn". Blink fortsatt False (blink bare tett på target)
    monkeypatch.setattr(countdown, "_now_ms", lambda: target_ms - ms(3))
    t2 = countdown.compute_tick(cfg)
    assert t2["mode"] == "warn"
    assert t2.get("blink", False) is False

    # 90 sek før -> "alert". Blink kan fortsatt være False (avh. av blink_seconds)
    monkeypatch.setattr(countdown, "_now_ms", lambda: target_ms - ms(1.5))
    t3 = countdown.compute_tick(cfg)
    assert t3["mode"] == "alert"


def test_tick_overrun_then_ended(monkeypatch) -> None:
    tz = countdown.TZ
    base = datetime.now(tz).replace(second=0, microsecond=0)
    target_ms = fixed_now_ms(base)
    cfg = base_cfg(
        mode="once",
        once_at=base.isoformat(),
        overrun_minutes=2,
        warn_minutes=4,
        alert_minutes=2,
    )

    # like etter target -> overrun
    monkeypatch.setattr(countdown, "_now_ms", lambda: target_ms + ms(1))
    t = countdown.compute_tick(cfg)
    assert t["state"] in ("overrun", "ended")
    assert t["state"] == "overrun"
    assert t["display_ms"] == ms(1)

    # etter overrun-vindu -> ended (slik din implementasjon gjør)
    monkeypatch.setattr(countdown, "_now_ms", lambda: target_ms + ms(3))
    t2 = countdown.compute_tick(cfg)
    assert t2["state"] == "ended"
    assert t2["display_ms"] == 0
