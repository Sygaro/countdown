# app/storage.py
from __future__ import annotations
import json, os, time, fcntl, shutil
from tempfile import NamedTemporaryFile
from typing import Any, Dict, Optional, Union, Tuple
from pathlib import Path
from datetime import datetime, timezone
from .settings import CONFIG_PATH, TZ

_CONFIG_PATH: Path = Path(CONFIG_PATH).resolve()

_DEFAULT: Dict[str, Any] = {
    "show_message_primary": True,
    "show_message_secondary": True,
    "message_primary": "Velkommen!",
    "message_secondary": "Vi starter igjen kl:",
    "warn_minutes": 4,
    "alert_minutes": 2,
    "blink_seconds": 10,
    "overrun_minutes": 1,
    "admin_password": "",
    "target_ms": 0,
    "target_iso": "",
    "target_datetime": "",
    "daily_time": "19:00"
}

def get_config_path() -> Path:
    return _CONFIG_PATH

# ---------------- IO (atomisk + eksklusiv lås kun ved write) ----------------

def _lock_file_for_write(path: Path) -> int:
    fd = os.open(str(path), os.O_RDWR | os.O_CREAT, 0o600)
    fcntl.flock(fd, fcntl.LOCK_EX)
    return fd

def _unlock_file(fd: int) -> None:
    try: fcntl.flock(fd, fcntl.LOCK_UN)
    finally: os.close(fd)

def _atomic_write_json(path: Path, data: Dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists() and path.is_file():
        try: shutil.copy2(path, path.with_suffix(path.suffix + ".bak"))
        except Exception: pass
    with NamedTemporaryFile(mode="w", encoding="utf-8", dir=str(path.parent), delete=False) as tmp:
        json.dump(data, tmp, ensure_ascii=False, indent=2)
        tmp.write("\n"); tmp.flush(); os.fsync(tmp.fileno())
        tmp_name = tmp.name
    os.replace(tmp_name, path)
    try:
        dfd = os.open(str(path.parent), os.O_DIRECTORY)
        try: os.fsync(dfd)
        finally: os.close(dfd)
    except Exception:
        pass

# ---------------- helpers: merge, sanitize, normalize ------------------------

def _deep_merge_skip_empty(dst: Dict[str, Any], patch: Dict[str, Any]) -> Dict[str, Any]:
    for k, v in (patch or {}).items():
        if v is None or (isinstance(v, str) and v == ""):
            continue
        if isinstance(v, dict) and isinstance(dst.get(k), dict):
            dst[k] = _deep_merge_skip_empty(dst[k], v)  # type: ignore[assignment]
        else:
            dst[k] = v
    return dst

def _strip_internal_keys(d: Dict[str, Any]) -> Dict[str, Any]:
    return {k: v for k, v in (d or {}).items() if not (isinstance(k, str) and k.startswith("__"))}

def _to_int(v: Any, default: int = 0, minv: int = 0) -> Tuple[int, bool]:
    orig = v
    try:
        if v in ("", None):  # <- viktig: tom streng blir 0
            x = default
        else:
            x = int(v)
    except Exception:
        x = default
    if x < minv: x = minv
    return x, (x != orig)

def _to_bool(v: Any, default: bool = False) -> Tuple[bool, bool]:
    orig = v
    if isinstance(v, bool): return v, False
    if v in ("", None): return default, (default != orig)
    if isinstance(v, (int, float)): return (v != 0), (bool(v) != orig)
    if isinstance(v, str): return (v.strip().lower() in ("1","true","yes","on")), (True != orig and False != orig)
    return default, (default != orig)

def _to_str(v: Any, default: str = "") -> Tuple[str, bool]:
    orig = v
    if v is None: return default, (default != orig)
    s = str(v)
    return s, (s != orig)

def _sanitize_target_patch(patch: Dict[str, Any]) -> Dict[str, Any]:
    p = dict(patch or {})
    explicit_clear = p.get("__clear_target") is True or (
        isinstance(p.get("target_datetime"), str) and p["target_datetime"].strip() == "__clear__"
    )

    td = p.get("target_datetime")
    if isinstance(td, str) and td and td != "__clear__":
        try:
            dt = datetime.fromisoformat(td)
            if dt.tzinfo is None: dt = dt.replace(tzinfo=TZ)
            utc = dt.astimezone(timezone.utc)
            p["target_ms"] = int(utc.timestamp() * 1000)
            p["target_iso"] = utc.isoformat()
        except Exception:
            p.pop("target_datetime", None)

    if not explicit_clear:
        if p.get("target_ms") in (0, "", None): p.pop("target_ms", None)
        if isinstance(p.get("target_iso"), str) and not p["target_iso"].strip(): p.pop("target_iso", None)
        if isinstance(p.get("target_datetime"), str) and p["target_datetime"].strip() in ("", "__clear__"): p.pop("target_datetime", None)
    else:
        p.update({"target_ms": 0, "target_iso": "", "target_datetime": ""})

    p.pop("__clear_target", None)
    return p

def _normalize_types(cfg: Dict[str, Any]) -> Tuple[Dict[str, Any], bool]:
    """
    Sørg for at alle felt har korrekt type. Viktig for å unngå 500 i /api/config POST.
    """
    changed = False
    out = dict(cfg)

    for k in ("warn_minutes", "alert_minutes", "blink_seconds", "overrun_minutes"):
        out[k], ch = _to_int(out.get(k, _DEFAULT[k]), _DEFAULT[k], 0); changed = changed or ch

    out["target_ms"], ch = _to_int(out.get("target_ms", 0), 0, 0); changed = changed or ch

    for k in ("show_message_primary", "show_message_secondary"):
        out[k], ch = _to_bool(out.get(k, _DEFAULT[k]), _DEFAULT[k]); changed = changed or ch

    for k in ("message_primary", "message_secondary", "admin_password", "target_iso", "target_datetime", "daily_time"):
        default = _DEFAULT.get(k, "")
        out[k], ch = _to_str(out.get(k, default), default); changed = changed or ch

    return out, changed

def _migrate(cfg: Dict[str, Any]) -> Tuple[Dict[str, Any], bool]:
    changed = False
    # Gamle nøkler -> nye
    if "warn_seconds" in cfg and "warn_minutes" not in cfg:
        try: cfg["warn_minutes"] = max(0, int(cfg["warn_seconds"])) // 60; changed = True
        except Exception: pass
        cfg.pop("warn_seconds", None)
    if "blink_under_seconds" in cfg and "blink_seconds" not in cfg:
        try: cfg["blink_seconds"] = max(0, int(cfg["blink_under_seconds"])); changed = True
        except Exception: pass
        cfg.pop("blink_under_seconds", None)
    if "message" in cfg and "message_primary" not in cfg:
        try: cfg["message_primary"] = str(cfg["message"]); changed = True
        except Exception: pass
        cfg.pop("message", None)

    # Defaults for manglende felt
    for k, v in _DEFAULT.items():
        if k not in cfg:
            cfg[k] = v; changed = True

    # Type-normalisering (f.eks. "" -> 0 for target_ms)
    cfg, ch2 = _normalize_types(cfg); changed = changed or ch2

    if changed:
        cfg["_migrated_at"] = int(time.time())
    return cfg, changed

# --------------------------- Public API --------------------------------------

def load_config() -> Dict[str, Any]:
    path = get_config_path()

    if not path.exists():
        cfg = _DEFAULT.copy()
        fd = _lock_file_for_write(path)
        try: _atomic_write_json(path, cfg)
        finally: _unlock_file(fd)
        return cfg

    try:
        with open(path, "r", encoding="utf-8") as f:
            cfg = json.load(f)
    except json.JSONDecodeError:
        bak = path.with_suffix(path.suffix + ".bak")
        if bak.exists():
            with open(bak, "r", encoding="utf-8") as f:
                cfg = json.load(f)
            cfg, _ = _migrate(dict(cfg))
            return cfg
        cfg, _ = _migrate(_DEFAULT.copy())
        return cfg

    migrated, changed = _migrate(dict(cfg))
    if changed:
        fd = _lock_file_for_write(path)
        try: _atomic_write_json(path, migrated)
        finally: _unlock_file(fd)
    return migrated

def replace_config(new_cfg: Dict[str, Any]) -> Dict[str, Any]:
    if not isinstance(new_cfg, dict): raise TypeError("Config must be a dict")
    safe = _migrate(_sanitize_target_patch(_strip_internal_keys(new_cfg)))[0]
    safe["_updated_at"] = int(time.time())
    path = get_config_path()
    fd = _lock_file_for_write(path)
    try: _atomic_write_json(path, safe)
    finally: _unlock_file(fd)
    return safe

def save_config_patch(patch: Dict[str, Any]) -> Dict[str, Any]:
    current = load_config()
    safe_patch = _sanitize_target_patch(_strip_internal_keys(patch))
    merged = _deep_merge_skip_empty(current, safe_patch)
    merged, _ = _migrate(merged)
    merged["_updated_at"] = int(time.time())
    path = get_config_path()
    fd = _lock_file_for_write(path)
    try: _atomic_write_json(path, merged)
    finally: _unlock_file(fd)
    return merged

def save_target_datetime(target: Union[datetime, int], *, __source: Optional[str] = None) -> Dict[str, Any]:
    if isinstance(target, datetime):
        dt = target if target.tzinfo else target.replace(tzinfo=TZ)
        utc = dt.astimezone(timezone.utc)
        ms = int(utc.timestamp() * 1000); iso = utc.isoformat()
    elif isinstance(target, int):
        ms = int(target); iso = datetime.fromtimestamp(ms/1000, tz=timezone.utc).isoformat()
    else:
        raise TypeError("target must be datetime or epoch-ms int")
    return save_config_patch({"target_ms": ms, "target_iso": iso, "target_datetime": iso, "__source": __source or "save_target_datetime"})
