from __future__ import annotations

import time
from datetime import datetime, timedelta, timezone
from typing import Any, Dict

from .settings import TZ

# --- Monotonic-based wall clock ---
_MONO0 = time.monotonic_ns()
_WALL0 = int(time.time() * 1000)

def _now_ms() -> int:
    return _WALL0 + (time.monotonic_ns() - _MONO0) // 1_000_000

_ENGINE: Dict[str, Any] = {
    "sticky_target_ms": 0,
    "sticky_set_at_ms": 0,
    "session_until_ms": 0,   # freeze target until this time (target + overrun)
}

def _parse_hhmm(hhmm: str) -> tuple[int, int]:
    hh, mm = hhmm.strip().split(":", 1)
    return int(hh), int(mm)

def _next_from_daily(hhmm: str, now_dt: datetime) -> datetime:
    hh, mm = _parse_hhmm(hhmm)
    cand = now_dt.replace(hour=hh, minute=mm, second=0, microsecond=0)
    if cand <= now_dt:
        cand += timedelta(days=1)
    return cand

def _resolve_target_ms(cfg: Dict[str, Any]) -> int:
    # 1) explicit target_ms
    try:
        tms = int(cfg.get("target_ms") or 0)
        if tms > 0:
            return tms
    except Exception:
        pass

    # 2) specific datetime (iso)
    iso = (cfg.get("target_datetime") or cfg.get("target_iso") or "").strip()
    if iso:
        try:
            dt = datetime.fromisoformat(iso)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=TZ)
            utc = dt.astimezone(timezone.utc)
            return int(utc.timestamp() * 1000)
        except Exception:
            pass

    # 3) daily time
    daily = (cfg.get("daily_time") or "").strip()
    if daily:
        now_dt = datetime.now(TZ)
        nxt = _next_from_daily(daily, now_dt)
        return int(nxt.astimezone(timezone.utc).timestamp() * 1000)

    return 0

def compute_tick(cfg: Dict[str, Any]) -> Dict[str, Any]:
    now_ms = _now_ms()

    warn_ms   = max(0, int(cfg.get("warn_minutes", 4))) * 60_000
    alert_ms  = max(0, int(cfg.get("alert_minutes", 2))) * 60_000
    overrun_ms = max(0, int(cfg.get("overrun_minutes", 1))) * 60_000
    blink_s   = max(0, int(cfg.get("blink_seconds", 10)))

    resolved_target = _resolve_target_ms(cfg)

    eng = _ENGINE

    # Freeze: behold target til (target + overrun) er passert.
    session_until_ms = int(eng.get("session_until_ms") or 0)
    sticky_target = int(eng.get("sticky_target_ms") or 0)

    if sticky_target == 0 or abs(resolved_target - sticky_target) > 250:
        # Ny sesjon
        sticky_target = int(resolved_target)
        session_until_ms = 0
        if sticky_target > 0:
            session_until_ms = sticky_target + overrun_ms
        eng["sticky_target_ms"] = sticky_target
        eng["sticky_set_at_ms"] = now_ms
        eng["session_until_ms"] = session_until_ms
    else:
        # Samme sesjon
        if sticky_target > 0 and now_ms <= (session_until_ms or 0):
            resolved_target = sticky_target
        else:
            # Frysevindu er over – tillat nytt daglig mål
            sticky_target = int(resolved_target)
            if sticky_target > 0:
                session_until_ms = sticky_target + overrun_ms
            else:
                session_until_ms = 0
            eng["sticky_target_ms"] = sticky_target
            eng["session_until_ms"] = session_until_ms

    target_ms = sticky_target

    remaining = target_ms - now_ms if target_ms > 0 else 0

    if target_ms <= 0:
        phase = "idle"; display_ms = 0; signed_display_ms = 0; mode = "ended"; blink = False
    elif remaining > 0:
        phase = "countdown"
        display_ms = remaining
        signed_display_ms = remaining
        mode = "alert" if remaining <= alert_ms else ("warn" if remaining <= warn_ms else "normal")
        blink = remaining <= (blink_s * 1000)
    elif -remaining <= overrun_ms:
        phase = "overrun"
        display_ms = -remaining
        signed_display_ms = remaining  # negative
        mode = "over"
        blink = False  # stopp blink i minus
    else:
        phase = "ended"
        display_ms = 0
        signed_display_ms = 0
        mode = "ended"
        blink = False

    # Lokal HH:MM for sekundærtekst
    target_hhmm = ""
    if target_ms > 0:
        try:
            t_local = datetime.fromtimestamp(target_ms / 1000, tz=timezone.utc).astimezone(TZ)
            target_hhmm = f"{t_local.hour:02d}:{t_local.minute:02d}"
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

def derive_state(cfg: Dict[str, Any]) -> Dict[str, Any]:
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
