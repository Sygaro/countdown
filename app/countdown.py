# app/countdown.py
from __future__ import annotations
import time
from datetime import datetime, timedelta
from typing import Dict, Any, Optional
from .settings import TZ

# Monotonic-basert veggklokke for å unngå NTP-hopp
_MONO0_NS = time.monotonic_ns()
_WALL0_MS = int(time.time() * 1000)
def _now_ms() -> int:
    return _WALL0_MS + (time.monotonic_ns() - _MONO0_NS) // 1_000_000

_ENGINE: Dict[str, Any] = { "sticky_target_ms": 0, "sticky_set_at_ms": 0 }

def _parse_hhmm(hhmm: str) -> tuple[int,int]:
    hh, mm = hhmm.strip().split(":", 1)
    return int(hh), int(mm)

def _next_from_daily(hhmm: str, now_dt: datetime) -> datetime:
    hh, mm = _parse_hhmm(hhmm)
    cand = now_dt.replace(hour=hh, minute=mm, second=0, microsecond=0)
    if cand <= now_dt:
        cand += timedelta(days=1)
    return cand

def _resolve_target_ms(cfg: Dict[str, Any], now_ms: int) -> int:
    try:
        tms = int(cfg.get("target_ms") or 0)
        if tms > 0:
            return tms
    except Exception:
        pass
    iso = (cfg.get("target_datetime") or cfg.get("target_iso") or "").strip()
    if iso:
        try:
            dt = datetime.fromisoformat(iso)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=TZ)
            else:
                dt = dt.astimezone(TZ)
            return int(dt.timestamp() * 1000)
        except Exception:
            pass
    daily = (cfg.get("daily_time") or "").strip()
    if daily:
        now_dt = datetime.fromtimestamp(now_ms / 1000, tz=TZ)
        nxt = _next_from_daily(daily, now_dt)
        return int(nxt.timestamp() * 1000)
    return 0

def _ms_from_minutes(cfg: Dict[str, Any], key: str, default_min: int) -> int:
    try:
        return max(0, int(cfg.get(key, default_min))) * 60_000
    except Exception:
        return default_min * 60_000

def compute_tick(cfg: Dict[str, Any]) -> Dict[str, Any]:
    """
    Returnerer autoritativ status. Legger ved:
      - display_ms (alltid positiv)
      - signed_display_ms (negativ i overrun)
    """
    now_ms = _now_ms()
    warn_ms = _ms_from_minutes(cfg, "warn_minutes", 5)
    alert_ms = _ms_from_minutes(cfg, "alert_minutes", 2)
    overrun_ms = _ms_from_minutes(cfg, "overrun_minutes", 1)
    blink_s = max(0, int(cfg.get("blink_seconds", 10)))

    target_ms = _resolve_target_ms(cfg, now_ms)

    sticky = int(_ENGINE.get("sticky_target_ms") or 0)
    if target_ms <= 0 and sticky > 0:
        if now_ms <= sticky + overrun_ms + 5_000:
            target_ms = sticky

    if target_ms > now_ms + 2_000 and target_ms != sticky:
        _ENGINE["sticky_target_ms"] = target_ms
        _ENGINE["sticky_set_at_ms"] = now_ms

    rem = target_ms - now_ms
    if target_ms <= 0:
        phase = "idle"
    elif rem > 0:
        phase = "running"
    elif -rem <= overrun_ms:
        phase = "overrun"
    else:
        phase = "ended"

    if phase == "running":
        display_ms = rem
        signed_display_ms = rem
        mode = "alert" if rem <= alert_ms else ("warn" if rem <= warn_ms else "normal")
        blink = rem <= blink_s * 1000
    elif phase == "overrun":
        display_ms = -rem               # positiv visning, men under legger vi negativ verdi også
        signed_display_ms = -display_ms # negativt tall
        mode = "over"
        blink = False
    else:
        display_ms = 0
        signed_display_ms = 0
        mode = "ended"
        blink = False

    target_hhmm = ""
    if target_ms > 0:
        try:
            target_hhmm = datetime.fromtimestamp(target_ms / 1000, tz=TZ).strftime("%H:%M")
        except Exception:
            target_hhmm = ""

    return {
        "state": phase,
        "now_ms": int(now_ms),
        "target_ms": int(target_ms),
        "target_hhmm": target_hhmm,
        "display_ms": int(max(0, display_ms)),
        "signed_display_ms": int(signed_display_ms),
        "warn_ms": int(warn_ms),
        "alert_ms": int(alert_ms),
        "overrun_ms": int(overrun_ms),
        "mode": mode,
        "blink": bool(blink),
    }

def derive_state(cfg: Dict[str, Any], now: Optional[datetime] = None) -> Dict[str, Any]:
    t = compute_tick(cfg)
    remaining_ms = int(t["target_ms"] - t["now_ms"]) if t["target_ms"] else 0
    return {
        "state": t["state"],
        "now_ms": t["now_ms"],
        "target_ms": t["target_ms"],
        "target_hhmm": t.get("target_hhmm", ""),
        "remaining_ms": remaining_ms,
        "warn_ms": t["warn_ms"],
        "alert_ms": t["alert_ms"],
        "overrun_ms": t["overrun_ms"],
        "blink": t["blink"],
    }
