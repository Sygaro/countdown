# app/countdown.py
from __future__ import annotations

import time
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

from .settings import TZ

# Monotonic-basert "veggklokke" for å unngå hopp ved NTP-sync
_MONO0_NS = time.monotonic_ns()
_WALL0_MS = int(time.time() * 1000)


def _now_ms() -> int:
    return _WALL0_MS + (time.monotonic_ns() - _MONO0_NS) // 1_000_000


# Enkel "sticky" motor slik at små endringer i target ikke jitter i klienten
_ENGINE: Dict[str, Any] = {
    "sticky_target_ms": 0,
    "sticky_set_at_ms": 0,
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


def _resolve_target_ms(cfg: Dict[str, Any], now_ms: int) -> int:
    # 1) Eksplisitt target_ms (UTC-epoch ms)
    try:
        tms = int(cfg.get("target_ms") or 0)
        if tms > 0:
            return tms
    except Exception:
        pass

    # 2) Engangstidspunkt (target_datetime eller target_iso)
    iso = (cfg.get("target_datetime") or cfg.get("target_iso") or "").strip()
    if iso:
        try:
            dt = datetime.fromisoformat(iso)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=TZ)
            utc = dt.astimezone(timezone.utc)
            return int(utc.timestamp() * 1000)
        except Exception:
            pass  # fallthrough til daily_time

    # 3) Daglig klokkeslett
    daily = (cfg.get("daily_time") or "").strip()
    if daily:
        now_dt = datetime.fromtimestamp(now_ms / 1000, tz=TZ)
        nxt = _next_from_daily(daily, now_dt)
        return int(nxt.astimezone(timezone.utc).timestamp() * 1000)

    return 0


def compute_tick(cfg: Dict[str, Any]) -> Dict[str, Any]:
    # overrun_minutes håndteres som MINUTTER (× 60 000 ms)
    # blink stopper når tiden blir negativ
    now_ms = _now_ms()

    warn_ms = max(0, int(cfg.get("warn_minutes", 4))) * 60_000
    alert_ms = max(0, int(cfg.get("alert_minutes", 2))) * 60_000
    overrun_ms = max(0, int(cfg.get("overrun_minutes", 1))) * 60_000  # <- pkt 2
    blink_s = max(0, int(cfg.get("blink_seconds", 10)))

    target_ms = _resolve_target_ms(cfg, now_ms)

    # Sticky for å dempe små endringer
    eng = _ENGINE
    if target_ms and (abs(target_ms - eng.get("sticky_target_ms", 0)) > 250):
        eng["sticky_target_ms"] = int(target_ms)
        eng["sticky_set_at_ms"] = now_ms
    else:
        target_ms = int(eng.get("sticky_target_ms", target_ms) or 0)

    remaining = target_ms - now_ms if target_ms > 0 else 0

    if target_ms <= 0:
        phase = "idle"; display_ms = 0; signed_display_ms = 0; mode = "ended"; blink = False
    elif remaining > 0:
        phase = "countdown"; display_ms = remaining; signed_display_ms = remaining
        mode = "alert" if remaining <= alert_ms else ("warn" if remaining <= warn_ms else "normal")
        blink = remaining <= (blink_s * 1000)
    elif -remaining <= overrun_ms:
        phase = "overrun"; display_ms = -remaining; signed_display_ms = remaining  # negativ verdi
        mode = "over"; blink = False  # <- pkt 1
    else:
        phase = "ended"; display_ms = 0; signed_display_ms = 0; mode = "ended"; blink = False

    # HH:MM til sekundærtekst når vi har et mål
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
