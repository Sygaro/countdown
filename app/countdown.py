# app/countdown.py
from __future__ import annotations
import time
from datetime import datetime, time as dtime, timedelta, timezone
from typing import Dict, Any, Optional
from .settings import TZ

# Monotonic-basert "nå" som ikke hopper ved NTP tidsskift
_MONO0_NS = time.monotonic_ns()
_WALL0_MS = int(time.time() * 1000)

def _now_ms() -> int:
    return _WALL0_MS + (time.monotonic_ns() - _MONO0_NS) // 1_000_000

# Sticky motor-tilstand (i prosessminne)
_ENGINE: Dict[str, Any] = {
    "last_target_ms": 0,
    "phase": "idle",               # 'idle'|'running'|'overrun'|'ended'
    "overrun_end_ms": None,        # int|None
}

# Hysterese for fasebytte rundt 0 ms (±1s)
ZERO_HYSTERESIS_MS = 1000

def _parse_hhmm(hhmm: str) -> dtime:
    hh, mm = hhmm.strip().split(":", 1)
    return dtime(hour=int(hh), minute=int(mm), tzinfo=TZ)

def _next_from_daily(hhmm: str, now_dt: datetime) -> datetime:
    t = _parse_hhmm(hhmm)
    candidate = now_dt.replace(hour=t.hour, minute=t.minute, second=0, microsecond=0)
    if candidate < now_dt:
        candidate += timedelta(days=1)
    return candidate

def _overrun_ms(cfg: Dict[str, Any]) -> int:
    try:
        return max(0, int(cfg.get("overrun_minutes", 5))) * 60_000
    except Exception:
        return 5 * 60_000

def _warn_ms(cfg: Dict[str, Any]) -> int:
    try:
        return max(0, int(cfg.get("warn_minutes", 3))) * 60_000
    except Exception:
        return 3 * 60_000

def _alert_ms(cfg: Dict[str, Any]) -> int:
    try:
        return max(0, int(cfg.get("alert_minutes", 1))) * 60_000
    except Exception:
        return 60_000

def _blink_s(cfg: Dict[str, Any]) -> int:
    try:
        return max(0, int(cfg.get("blink_seconds", 15)))
    except Exception:
        return 15

def _compute_next_target_ms(cfg: Dict[str, Any], now_ms: int) -> int:
    """
    Finn gjeldende target i epoch ms:
      1) target_ms når den er i fremtid, eller innenfor overrun-vinduet (ellers ignorér).
      2) target_datetime/target_iso (ISO). '__clear__' og '' ignoreres.
      3) daily_time -> neste forekomst.
    """
    over_ms = _overrun_ms(cfg)

    # 1) Direkte ms
    ms = cfg.get("target_ms")
    try:
        if ms is not None:
            ms_int = int(ms)
            if ms_int > 0:
                # behold hvis fremtid, eller i overrun-vindu
                if ms_int >= now_ms or (now_ms - ms_int) <= over_ms:
                    return ms_int
    except Exception:
        pass

    # 2) ISO
    iso = cfg.get("target_datetime") or cfg.get("target_iso")
    if isinstance(iso, str):
        s = iso.strip()
        if s and s != "__clear__":
            try:
                dt = datetime.fromisoformat(s)
                if dt.tzinfo is None:
                    dt = dt.replace(tzinfo=TZ)
                dt = dt.astimezone(TZ)
                ms_int = int(dt.timestamp() * 1000)
                if ms_int >= now_ms or (now_ms - ms_int) <= over_ms:
                    return ms_int
            except Exception:
                pass

    # 3) Daglig tid
    hhmm = cfg.get("daily_time")
    if hhmm:
        try:
            now_dt = datetime.fromtimestamp(now_ms / 1000, tz=TZ)
            dt = _next_from_daily(str(hhmm), now_dt)
            return int(dt.timestamp() * 1000)
        except Exception:
            pass

    return 0  # ingen mål

def _recalc_phase_and_anchors(cfg: Dict[str, Any], now_ms: int, target_ms: int) -> None:
    """Oppdater sticky fase/ankere ved target-endring."""
    over_ms = _overrun_ms(cfg)
    _ENGINE["last_target_ms"] = target_ms
    if target_ms <= 0:
        _ENGINE["phase"] = "idle"
        _ENGINE["overrun_end_ms"] = None
        return
    rem = target_ms - now_ms
    if rem > 0:
        _ENGINE["phase"] = "running"
        _ENGINE["overrun_end_ms"] = None
    elif -rem <= over_ms:
        _ENGINE["phase"] = "overrun"
        _ENGINE["overrun_end_ms"] = now_ms + max(0, over_ms - (-rem))
    else:
        _ENGINE["phase"] = "ended"
        _ENGINE["overrun_end_ms"] = None

def compute_tick(cfg: Dict[str, Any]) -> Dict[str, Any]:
    """
    Autoritativ visning fra serveren:
      - display_ms: hva som skal vises på skjermen akkurat nå
      - mode: normal|warn|alert|over|ended
      - blink: bool
      - target_ms, target_hhmm, now_ms, state (sticky)
      - warn_ms, alert_ms, overrun_ms
    """
    now_ms = _now_ms()
    target_ms = _compute_next_target_ms(cfg, now_ms)

    # Nytt mål? Re-initialiser sticky fase/ankere
    if target_ms != _ENGINE["last_target_ms"]:
        _recalc_phase_and_anchors(cfg, now_ms, target_ms)

    phase: str = _ENGINE["phase"]
    over_end = _ENGINE["overrun_end_ms"]

    # Hysterese/faselogikk for uendret target
    rem = target_ms - now_ms
    over_ms = _overrun_ms(cfg)
    if phase == "running" and rem <= -ZERO_HYSTERESIS_MS:
        _ENGINE["phase"] = phase = "overrun"
        _ENGINE["overrun_end_ms"] = over_end = now_ms + max(0, over_ms - (-rem))
    elif phase == "overrun":
        if over_end is not None and now_ms >= over_end:
            _ENGINE["phase"] = phase = "ended"
            _ENGINE["overrun_end_ms"] = over_end = None
    elif phase in ("idle", "ended"):
        if rem > ZERO_HYSTERESIS_MS:
            _ENGINE["phase"] = phase = "running"

    # Beregn display
    if phase == "running":
        display_ms = max(0, rem)
    elif phase == "overrun":
        if over_end is None:
            over_so_far = max(0, -rem)
            display_ms = max(0, over_ms - over_so_far)
        else:
            display_ms = max(0, over_end - now_ms)
    else:
        display_ms = 0

    warn_ms = _warn_ms(cfg)
    alert_ms = _alert_ms(cfg)
    blink = (phase == "running" and rem > 0 and rem <= _blink_s(cfg) * 1000)

    if phase == "overrun":
        mode = "over"
    elif phase in ("idle", "ended") or target_ms <= 0:
        mode = "ended"
    else:
        mode = "alert" if rem <= alert_ms else ("warn" if rem <= warn_ms else "normal")

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
        "display_ms": int(display_ms),
        "state": phase,
        "mode": mode,
        "blink": bool(blink),
        "warn_ms": int(warn_ms),
        "alert_ms": int(alert_ms),
        "overrun_ms": int(over_ms),
    }

# --- Bakoverkompatibel wrapper for /state og admin-kall ---
def derive_state(cfg: Dict[str, Any], now: Optional[datetime] = None) -> Dict[str, Any]:
    """
    Oppfører seg som tidligere /state: gir remaining_ms (kan være negativ),
    samt varsler, blink og state.
    """
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
