# app/storage.py
from __future__ import annotations
import json, os, time, fcntl
from tempfile import NamedTemporaryFile
from typing import Any, Dict, Optional, Union
from pathlib import Path
from datetime import datetime, timezone

from .settings import CONFIG_PATH, TZ

# Hvorfor: én kilde til sannhet for config-plassering
_CONFIG_PATH: Path = Path(os.environ.get("COUNTDOWN_CONFIG") or CONFIG_PATH).resolve()

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
    # "daily_time": "23:00",
}

def get_config_path() -> Path:
    return _CONFIG_PATH

def _lock_file_for_write(path: Path):
    # Hvorfor: hindre race ved samtidige writes (gunicorn workers)
    fd = os.open(str(path), os.O_RDWR | os.O_CREAT, 0o644)
    fcntl.flock(fd, fcntl.LOCK_EX)
    return fd

def _unlock_file(fd: int):
    try:
        fcntl.flock(fd, fcntl.LOCK_UN)
    finally:
        os.close(fd)

def _atomic_write_json(path: Path, data: Dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    # Backup
    if path.exists() and path.is_file():
        try: path.replace(path.with_suffix(path.suffix + ".bak"))
        except Exception: pass

    with NamedTemporaryFile(mode="w", encoding="utf-8", dir=str(path.parent), delete=False) as tmp:
        json.dump(data, tmp, ensure_ascii=False, indent=2)
        tmp.write("\n"); tmp.flush(); os.fsync(tmp.fileno())
        tmp_name = tmp.name
    os.replace(tmp_name, path)

def _deep_merge_skip_empty(dst: Dict[str, Any], patch: Dict[str, Any]) -> Dict[str, Any]:
    for k, v in patch.items():
        if v is None or (isinstance(v, str) and v == ""):
            continue  # hvorfor: tom input skal ikke “rydde vekk” verdier
        if isinstance(v, dict) and isinstance(dst.get(k), dict):
            dst[k] = _deep_merge_skip_empty(dst[k], v)  # type: ignore
        else:
            dst[k] = v
    return dst

def _migrate(cfg: Dict[str, Any]) -> Dict[str, Any]:
    changed = False
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

    for k, v in _DEFAULT.items():
        cfg.setdefault(k, v)

    if changed:
        cfg["_migrated_at"] = int(time.time())
    return cfg

def _sanitize_target_patch(patch: Dict[str, Any]) -> Dict[str, Any]:
    p = dict(patch or {})
    explicit_clear = p.get("__clear_target") is True or (isinstance(p.get("target_datetime"), str) and p["target_datetime"].strip() == "__clear__")

    td = p.get("target_datetime")
    if isinstance(td, str) and td and td != "__clear__":
        try:
            dt = datetime.fromisoformat(td)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=TZ)
            utc = dt.astimezone(timezone.utc)
            p["target_ms"] = int(utc.timestamp() * 1000)
            p["target_iso"] = utc.isoformat()
        except Exception:
            p.pop("target_datetime", None)

    if not explicit_clear:
        if p.get("target_ms") in (0, None): p.pop("target_ms", None)
        if isinstance(p.get("target_iso"), str) and not p["target_iso"].strip():
            p.pop("target_iso", None)
        if isinstance(p.get("target_datetime"), str) and p["target_datetime"].strip() in ("", "__clear__"):
            p.pop("target_datetime", None)
    else:
        p.update({"target_ms": 0, "target_iso": "", "target_datetime": ""})

    p.pop("__clear_target", None)
    return p

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
            fd = _lock_file_for_write(path)
            try: _atomic_write_json(path, cfg)
            finally: _unlock_file(fd)
            return cfg
        cfg = _DEFAULT.copy()
        fd = _lock_file_for_write(path)
        try: _atomic_write_json(path, cfg)
        finally: _unlock_file(fd)
        return cfg

    migrated = _migrate(dict(cfg))
    if migrated is not cfg:
        fd = _lock_file_for_write(path)
        try: _atomic_write_json(path, migrated)
        finally: _unlock_file(fd)
    return migrated

def replace_config(new_cfg: Dict[str, Any]) -> Dict[str, Any]:
    if not isinstance(new_cfg, dict):
        raise TypeError("Config must be a dict")
    safe = _migrate(_sanitize_target_patch(new_cfg))
    safe["_updated_at"] = int(time.time())
    path = get_config_path()
    fd = _lock_file_for_write(path)
    try: _atomic_write_json(path, safe)
    finally: _unlock_file(fd)
    return safe

def save_config_patch(patch: Dict[str, Any]) -> Dict[str, Any]:
    current = load_config()
    safe_patch = _sanitize_target_patch(patch)
    merged = _migrate(_deep_merge_skip_empty(current, safe_patch))
    merged["_updated_at"] = int(time.time())
    path = get_config_path()
    fd = _lock_file_for_write(path)
    try: _atomic_write_json(path, merged)
    finally: _unlock_file(fd)
    return merged

def save_target_datetime(target: Union[datetime, int], *, __source: Optional[str] = None) -> Dict[str, Any]:
    if isinstance(target, datetime):
        if target.tzinfo is None:
            target = target.replace(tzinfo=TZ)
        utc = target.astimezone(timezone.utc)
        ms = int(utc.timestamp() * 1000)
        iso = utc.isoformat()
    elif isinstance(target, int):
        ms = int(target)
        iso = datetime.fromtimestamp(ms / 1000, tz=timezone.utc).isoformat()
    else:
        raise TypeError("target must be datetime or epoch-ms int")

    return save_config_patch({
        "target_ms": ms,
        "target_iso": iso,
        "target_datetime": iso,
        "__source": __source or "save_target_datetime",
    })
