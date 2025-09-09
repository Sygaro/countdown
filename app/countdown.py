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

def _overrun_window_ms(cfg: Dict[str, Any]) -> int:
    try:
        return max(0, int(cfg.get("overrun_minutes", 5))) * 60_000
    except Exception:
        return 5 * 60_000

def compute_target_dt(cfg: Dict[str, Any], now: Optional[datetime] = None) -> Optional[datetime]:
    """
    Resolve neste måltidspunkt med følgende prioritet:
      1) target_ms (epoch ms) – men ignoreres hvis den er utgått utover overrun-vinduet.
      2) target_datetime / target_iso (ISO 8601) – samme regel som over.
      3) daily_time (HH:MM) – neste forekomst.
    """
    now = now or datetime.now(TZ)
    over_ms = _overrun_window_ms(cfg)

    # 1) Epoch milliseconds
    ms = cfg.get("target_ms")
    try:
        if ms is not None:
            ms_int = int(ms)
            if ms_int > 0:
                dt = datetime.fromtimestamp(ms_int / 1000, tz=TZ)
                # Hvis dt er i fortid, behold den bare innenfor overrun-vinduet,
                # ellers ignorer og gå videre til daily_time.
                if dt >= now or (now - dt).total_seconds() * 1000 <= over_ms:
                    return dt
    except Exception:
        pass

    # 2) ISO strings (treat '__clear__' or '' as cleared)
    iso = cfg.get("target_datetime") or cfg.get("target_iso")
    if isinstance(iso, str):
        s = iso.strip()
        if s and s != "__clear__":
            try:
                dt = datetime.fromisoformat(s)
                if dt.tzinfo is None:
                    dt = dt.replace(tzinfo=TZ)
                dt = dt.astimezone(TZ)
                if dt >= now or (now - dt).total_seconds() * 1000 <= over_ms:
                    return dt
            except Exception:
                pass

    # 3) Daily HH:MM
    hhmm = cfg.get("daily_time")
    if hhmm:
        try:
            return _target_from_daily(str(hhmm), now)
        except Exception:
            pass

    return None

def derive_state(cfg: Dict[str, Any], now: Optional[datetime] = None) -> Dict[str, Any]:
    now = now or datetime.now(TZ)
    target = compute_target_dt(cfg, now)
    if target is None:
        return {
            "state": "idle",
            "now_ms": int(now.timestamp() * 1000),
            "warn_ms": int(cfg.get("warn_minutes", 3)) * 60_000,
            "alert_ms": int(cfg.get("alert_minutes", 1)) * 60_000,
            "overrun_ms": _overrun_window_ms(cfg),
        }

    delta = target - now
    remaining_ms = int(delta.total_seconds() * 1000)

    warn_ms = int(cfg.get("warn_minutes", 3)) * 60_000
    alert_ms = int(cfg.get("alert_minutes", 1)) * 60_000
    blink_s = int(cfg.get("blink_seconds", 15))
    overrun_ms = _overrun_window_ms(cfg)

    status = "running"
    blink = False

    if remaining_ms <= 0:
        if abs(remaining_ms) <= overrun_ms:
            status = "overrun"
            blink = False  # blink skal stoppe i minus-tid
        else:
            status = "ended"
            blink = False
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
        "overrun_ms": overrun_ms,
        "blink": blink,
    }
