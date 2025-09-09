from __future__ import annotations
from datetime import datetime, time, timedelta
from typing import Dict, Any, Optional
from .settings import TZ

def _parse_hhmm(hhmm: str) -> time:
    hh, mm = hhmm.strip().split(":", 1)
    return time(hour=int(hh), minute=int(mm), tzinfo=TZ)

def _target_from_daily(hhmm: str, now: datetime) -> datetime:
    t = _parse_hhmm(hhmm)
    candidate = now.replace(hour=t.hour, minute=t.minute, second=0, microsecond=0)
    if candidate < now:
        candidate += timedelta(days=1)
    return candidate

def compute_target_dt(cfg: Dict[str, Any], now: Optional[datetime] = None) -> Optional[datetime]:
    now = now or datetime.now(TZ)
    target_iso = cfg.get("target_datetime")
    if target_iso:
        try:
            dt = datetime.fromisoformat(str(target_iso))
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=TZ)
            return dt.astimezone(TZ)
        except Exception:
            return None
    hhmm = cfg.get("daily_time")
    if hhmm:
        try:
            return _target_from_daily(str(hhmm), now)
        except Exception:
            return None
    return None

def compute_next_epoch_ms(cfg: Dict[str, Any], now: Optional[datetime] = None) -> int:
    dt = compute_target_dt(cfg, now)
    return int(dt.timestamp() * 1000) if dt else 0

def derive_state(cfg: Dict[str, Any], now: Optional[datetime] = None) -> Dict[str, Any]:
    now = now or datetime.now(TZ)
    target = compute_target_dt(cfg, now)
    if target is None:
        return {"state": "idle", "now_ms": int(now.timestamp() * 1000)}

    delta = target - now
    remaining_ms = int(delta.total_seconds() * 1000)

    warn_ms = int(cfg.get("warn_minutes", 3)) * 60_000
    alert_ms = int(cfg.get("alert_minutes", 1)) * 60_000
    blink_s = int(cfg.get("blink_seconds", 15))
    overrun_ms = int(cfg.get("overrun_minutes", 5)) * 60_000

    status = "running"
    blink = False

    if remaining_ms <= 0:
        if abs(remaining_ms) <= overrun_ms:
            status = "overrun"
        else:
            status = "ended"
    else:
        if remaining_ms <= blink_s * 1000:
            blink = True

    return {
        "state": status,
        "now_ms": int(now.timestamp() * 1000),
        "target_ms": int(target.timestamp() * 1000),
        "target_hhmm": target.astimezone(TZ).strftime("%H:%M"),
        "remaining_ms": remaining_ms,
        "warn_ms": warn_ms,
        "alert_ms": alert_ms,
        "blink": blink,
    }
