# app/storage.py
from __future__ import annotations
import json
import os
import time
from pathlib import Path
from tempfile import NamedTemporaryFile
from typing import Any, Dict, Union
from datetime import datetime, timezone

# Katalogoppsett
APP_DIR = Path(__file__).resolve().parent
DATA_DIR = APP_DIR / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)

# Defaultverdier (MINUTTER-baserte nøkler – i tråd med UI/admin)
DEFAULT_CONFIG: Dict[str, Any] = {
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
    # valgfritt: "daily_time": "23:00",
}

def get_config_path() -> Path:
    """
    Løs aktiv konfigsti dynamisk hver gang, slik at miljøendringer (COUNTDOWN_CONFIG)
    tas i bruk uten å måtte re-importere modulen.
    """
    env = os.environ.get("COUNTDOWN_CONFIG")
    if env and env.strip():
        return Path(env.strip())
    return DATA_DIR / "config.json"

def _fsync_directory(path: Path) -> None:
    try:
        fd = os.open(str(path), os.O_DIRECTORY)
        try:
            os.fsync(fd)
        finally:
            os.close(fd)
    except Exception:
        pass  # ikke kritisk på alle FS

def _atomic_write_json(path: Path, data: Dict[str, Any]) -> None:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)

    # valgfri enkel backup (behold siste .bak)
    if path.exists() and path.is_file():
        try:
            path.replace(path.with_suffix(path.suffix + ".bak"))
        except Exception:
            pass

    with NamedTemporaryFile(mode="w", encoding="utf-8", newline="\n",
                            dir=str(path.parent), delete=False) as tmp:
        json.dump(data, tmp, ensure_ascii=False, indent=2)
        tmp.write("\n")
        tmp.flush()
        os.fsync(tmp.fileno())
        tmp_name = tmp.name

    os.replace(tmp_name, path)
    _fsync_directory(path.parent)

def _deep_merge_preserve_empty(existing: Dict[str, Any], patch: Dict[str, Any]) -> Dict[str, Any]:
    """
    Dyp fletting:
      - Dict merges rekursivt.
      - Tom streng ("") og None i patch IGNORERES (overskriver ikke).
      - 0/False er gyldig verdi og overskriver.
    """
    for k, v in patch.items():
        if v is None or v == "":
            continue
        if isinstance(v, dict) and isinstance(existing.get(k), dict):
            existing[k] = _deep_merge_preserve_empty(existing[k], v)  # type: ignore[arg-type]
        else:
            existing[k] = v
    return existing

def _migrate_keys(cfg: Dict[str, Any]) -> Dict[str, Any]:
    """Migrer gamle nøkler -> nye navn/format. Returnerer evt. endret dict."""
    changed = False

    # warn_seconds -> warn_minutes
    if "warn_seconds" in cfg and "warn_minutes" not in cfg:
        try: cfg["warn_minutes"] = max(0, int(cfg["warn_seconds"]) // 60); changed = True
        except Exception: pass
        cfg.pop("warn_seconds", None)

    # crit_seconds -> alert_minutes
    if "crit_seconds" in cfg and "alert_minutes" not in cfg:
        try: cfg["alert_minutes"] = max(0, int(cfg["crit_seconds"]) // 60); changed = True
        except Exception: pass
        cfg.pop("crit_seconds", None)

    # blink_under_seconds -> blink_seconds
    if "blink_under_seconds" in cfg and "blink_seconds" not in cfg:
        try: cfg["blink_seconds"] = max(0, int(cfg["blink_under_seconds"])); changed = True
        except Exception: pass
        cfg.pop("blink_under_seconds", None)

    # message -> message_primary
    if "message" in cfg and "message_primary" not in cfg:
        try: cfg["message_primary"] = str(cfg["message"]); changed = True
        except Exception: pass
        cfg.pop("message", None)

    # Sørg for at obligatoriske default-felter finnes
    for k, v in DEFAULT_CONFIG.items():
        cfg.setdefault(k, v)

    if changed:
        cfg["_migrated_at"] = int(time.time())

    return cfg

def load_config() -> Dict[str, Any]:
    path = get_config_path()
    # Les + migrer + skriv tilbake ved behov
    try:
        with open(path, "r", encoding="utf-8") as f:
            cfg = json.load(f)
    except FileNotFoundError:
        cfg = DEFAULT_CONFIG.copy()
        _atomic_write_json(path, cfg)
        return cfg
    except json.JSONDecodeError:
        # Korrupt → forsøk .bak, ellers default
        bak = path.with_suffix(path.suffix + ".bak")
        if bak.exists():
            try:
                with open(bak, "r", encoding="utf-8") as f:
                    cfg = json.load(f)
                _atomic_write_json(path, cfg)
                return cfg
            except Exception:
                pass
        cfg = DEFAULT_CONFIG.copy()
        _atomic_write_json(path, cfg)
        return cfg

    migrated = _migrate_keys(dict(cfg))
    if migrated is not cfg:
        _atomic_write_json(path, migrated)
    return migrated

def replace_config(new_config: Dict[str, Any]) -> Dict[str, Any]:
    """Erstatt hele konfigen (full write)."""
    if not isinstance(new_config, dict):
        raise TypeError("Config must be a dict")
    path = get_config_path()
    new_config = _migrate_keys(dict(new_config))
    new_config.setdefault("_updated_at", int(time.time()))
    _atomic_write_json(path, new_config)
    return new_config

def save_config(patch: Dict[str, Any]) -> Dict[str, Any]:
    """Oppdater konfig: dypflett patch inn i eksisterende (tomme felt/None ignoreres)."""
    path = get_config_path()
    current = load_config()
    merged = _deep_merge_preserve_empty(current, dict(patch or {}))
    merged = _migrate_keys(merged)
    merged["_updated_at"] = int(time.time())
    _atomic_write_json(path, merged)
    return merged

# Backwards-compat aliaser brukt andre steder i appen
get_config = load_config
set_config = replace_config
update_config = save_config

# --- APIer brukt av admin.py ---

def save_config_patch(patch: Dict[str, Any]) -> Dict[str, Any]:
    """Alias brukt av admin.py for delvis oppdatering (patch)."""
    return save_config(patch)

def save_target_datetime(target: Union[datetime, int]) -> Dict[str, Any]:
    """Sett mål-tidspunkt.
    - target kan være datetime (aware/naiv) eller epoch ms (int).
    - Lagrer både 'target_ms' og ISO-strenger for kompatibilitet.
    """
    if isinstance(target, datetime):
        if target.tzinfo is None:
            target = target.astimezone()
        target_utc = target.astimezone(timezone.utc)
        target_ms = int(target_utc.timestamp() * 1000)
        target_iso = target_utc.isoformat()
    elif isinstance(target, int):
        target_ms = int(target)
        target_iso = datetime.fromtimestamp(target_ms / 1000, tz=timezone.utc).isoformat()
    else:
        raise TypeError("target must be a datetime or epoch milliseconds int")

    return save_config({
        "target_ms": target_ms,
        "target_iso": target_iso,
        "target_datetime": target_iso,  # kompatibilitet med eldre felt
    })
