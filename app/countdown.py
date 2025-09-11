# app/countdown.py
"""
Kjernelogikk for å beregne aktivt target basert på eksplisitt modus.
- daily   -> neste forekomst av daily_time
- once    -> once_at (ISO). Hvis i fortid: vis 'ended' til modus endres.
- duration-> duration_started_ms + duration_minutes

Returnerer 'tick' som appen kan vise, og lett fasestyring for blink/varsler.
"""
from __future__ import annotations

import time as _t
from datetime import datetime, time as dtime, timedelta
from typing import Any, Dict, Optional

from .settings import TZ


# Monotontid -> stabil visning ved NTP-justeringer.
_MONO0_NS = _t.monotonic_ns()
_WALL0_MS = int(_t.time() * 1000)


def _now_ms() -> int:
    return _WALL0_MS + (_t.monotonic_ns() - _MONO0_NS) // 1_000_000


def _parse_hhmm(hhmm: str) -> dtime:
    hh, mm = hhmm.strip().split(":", 1)
    return dtime(hour=int(hh), minute=int(mm), tzinfo=TZ)


def _next_from_daily(hhmm: str, now_dt: datetime) -> datetime:
    t = _parse_hhmm(hhmm)
    candidate = now_dt.replace(hour=t.hour, minute=t.minute, second=0, microsecond=0)
    if candidate < now_dt:
        candidate += timedelta(days=1)
    return candidate


def _ms_from_dt(dt: datetime) -> int:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=TZ)
    dt = dt.astimezone(TZ)
    return int(dt.timestamp() * 1000)


def compute_target_ms(cfg: Dict[str, Any], *, now_ms: Optional[int] = None) -> int:
    now_ms = now_ms if now_ms is not None else _now_ms()
    mode = cfg.get("mode", "daily")

    if mode == "daily":
        hhmm = (cfg.get("daily_time") or "").strip()
        if not hhmm:
            return 0
        dt = _next_from_daily(hhmm, datetime.fromtimestamp(now_ms / 1000, tz=TZ))
        return _ms_from_dt(dt)

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
    """
    Autoritativ status for klientene.
    """
    now_ms = _now_ms()
    target_ms = compute_target_ms(cfg, now_ms=now_ms)

    warn_ms = int(cfg.get("warn_minutes", 3)) * 60_000
    alert_ms = int(cfg.get("alert_minutes", 1)) * 60_000
    blink_s = int(cfg.get("blink_seconds", 15))

    rem = target_ms - now_ms
    if target_ms <= 0:
        state = "idle"
        mode = "ended"
        blink = False
        display_ms = 0
    else:
        if rem > 0:
            state = "running"
            mode = "alert" if rem <= alert_ms else ("warn" if rem <= warn_ms else "normal")
            blink = rem <= blink_s * 1000
            display_ms = rem
        else:
            # Minusvisning frem til overrun_ms
            overrun_ms = int(cfg.get("overrun_minutes", 5)) * 60_000
            if -rem <= overrun_ms:
                state = "overrun"
                mode = "over"
                blink = False  # Hvorfor: blink stopper når tida er ute
                display_ms = max(0, overrun_ms + rem)  # rem er negativ
            else:
                state = "ended"
                mode = "ended"
                blink = False
                display_ms = 0

    # HH:MM for info
    target_hhmm = ""
    if target_ms > 0:
        try:
            target_hhmm = datetime.fromtimestamp(target_ms / 1000, tz=TZ).strftime("%H:%M")
        except Exception:
            target_hhmm = ""

    return {
        "now_ms": now_ms,
        "target_ms": target_ms,
        "target_hhmm": target_hhmm,
        "display_ms": int(max(0, display_ms)),
        "state": state,  # running|overrun|ended|idle
        "mode": mode,    # normal|warn|alert|over|ended
        "blink": bool(blink),
        "warn_ms": warn_ms,
        "alert_ms": alert_ms,
        "overrun_ms": int(cfg.get("overrun_minutes", 5)) * 60_000,
    }
