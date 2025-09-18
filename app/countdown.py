# app/countdown.py
"""
Target-beregning + tick.
Ny kanonisk 'clock'-modus (tidligere 'screen').
"""
from __future__ import annotations
import time as _t
from datetime import datetime, time as dtime, timedelta
from typing import Any, Dict, Optional
from .settings import TZ

_MONO0_NS = _t.monotonic_ns()
_WALL0_MS = int(_t.time() * 1000)


def _now_ms() -> int:
    return _WALL0_MS + (_t.monotonic_ns() - _MONO0_NS) // 1_000_000


def _parse_hhmm(hhmm: str) -> dtime:
    hh, mm = hhmm.strip().split(":", 1)
    return dtime(hour=int(hh), minute=int(mm), tzinfo=TZ)


def _ms_from_dt(dt: datetime) -> int:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=TZ)
    return int(dt.astimezone(TZ).timestamp() * 1000)


def _next_daily_target_with_overrun(
    hhmm: str, now_dt: datetime, overrun_ms: int
) -> int:
    t = _parse_hhmm(hhmm)
    today = now_dt.replace(hour=t.hour, minute=t.minute, second=0, microsecond=0)
    if now_dt <= today:
        return _ms_from_dt(today)
    if (now_dt - today) <= timedelta(milliseconds=overrun_ms):
        return _ms_from_dt(today)
    return _ms_from_dt(today + timedelta(days=1))


def compute_target_ms(cfg: Dict[str, Any], *, now_ms: Optional[int] = None) -> int:
    now_ms = now_ms if now_ms is not None else _now_ms()
    mode = cfg.get("mode", "daily")

    if mode == "clock":
        return 0

    if mode == "daily":
        hhmm = (cfg.get("daily_time") or "").strip()
        if not hhmm:
            return 0
        overrun_ms = int(cfg.get("overrun_minutes", 1)) * 60_000
        return _next_daily_target_with_overrun(
            hhmm, datetime.fromtimestamp(now_ms / 1000, tz=TZ), overrun_ms
        )

    if mode == "once":
        s = (cfg.get("once_at") or "").strip()
        if not s:
            return 0
        try:
            dt = datetime.fromisoformat(s)
            return _ms_from_dt(dt)
        except Exception:
            return 0

    if mode == "duration":
        start_ms = int(cfg.get("duration_started_ms") or 0)
        mins = int(cfg.get("duration_minutes") or 0)
        if start_ms <= 0 or mins <= 0:
            return 0
        return start_ms + mins * 60_000

    return 0


def compute_tick(cfg: Dict[str, Any]) -> Dict[str, Any]:
    now_ms = _now_ms()
    mode_cfg = cfg.get("mode", "daily")

    if mode_cfg == "clock":
        return {
            "now_ms": now_ms,
            "target_ms": 0,
            "target_hhmm": "",
            "display_ms": 0,
            "signed_display_ms": 0,
            "state": "clock",
            "mode": "clock",
            "blink": False,
            "warn_ms": 0,
            "alert_ms": 0,
            "overrun_ms": 0,
        }

    target_ms = compute_target_ms(cfg, now_ms=now_ms)
    warn_ms = int(cfg.get("warn_minutes", 4)) * 60_000
    alert_ms = int(cfg.get("alert_minutes", 2)) * 60_000
    blink_s = int(cfg.get("blink_seconds", 10))

    signed = target_ms - now_ms
    if target_ms <= 0:
        state = "idle"
        phase = "ended"
        blink = False
        display_ms = 0
    else:
        if signed > 0:
            state = "countdown"
            phase = (
                "alert"
                if signed <= alert_ms
                else ("warn" if signed <= warn_ms else "normal")
            )
            blink = signed <= blink_s * 1000
            display_ms = signed
        else:
            overrun_ms = int(cfg.get("overrun_minutes", 1)) * 60_000
            if -signed <= overrun_ms:
                state = "overrun"
                phase = "over"
                blink = False
                display_ms = max(0, overrun_ms + signed)
            else:
                state = "ended"
                phase = "ended"
                blink = False
                display_ms = 0

    target_hhmm = ""
    if target_ms > 0:
        try:
            target_hhmm = datetime.fromtimestamp(target_ms / 1000, tz=TZ).strftime(
                "%H:%M"
            )
        except Exception:
            target_hhmm = ""

    return {
        "now_ms": now_ms,
        "target_ms": target_ms,
        "target_hhmm": target_hhmm,
        "display_ms": int(max(0, display_ms)),
        "signed_display_ms": int(signed),
        "state": state,
        "mode": phase,
        "blink": bool(blink),
        "warn_ms": warn_ms,
        "alert_ms": alert_ms,
        "overrun_ms": int(cfg.get("overrun_minutes", 1)) * 60_000,
    }
