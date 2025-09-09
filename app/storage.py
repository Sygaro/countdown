# app/storage.py
from __future__ import annotations
import json
import os
import time
from pathlib import Path
from tempfile import NamedTemporaryFile
from typing import Any, Dict

# Katalogoppsett
APP_DIR = Path(__file__).resolve().parent
DATA_DIR = APP_DIR / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)

# Overstyr sti via env hvis ønskelig
_CONFIG_PATH = Path(os.environ.get("COUNTDOWN_CONFIG", DATA_DIR / "config.json"))

# Defaultverdier (tilpass gjerne)
DEFAULT_CONFIG: Dict[str, Any] = {
    "message": "",
    "warn_seconds": 180,
    "crit_seconds": 60,
    "blink_under_seconds": 10,
}

def get_config_path() -> Path:
    return _CONFIG_PATH

def _fsync_directory(path: Path) -> None:
    try:
        fd = os.open(str(path), os.O_DIRECTORY)
        try:
            os.fsync(fd)
        finally:
            os.close(fd)
    except Exception:
        pass  # Ikke kritisk på alle FS

def _atomic_write_json(path: Path, data: Dict[str, Any]) -> None:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)

    # Valgfri enkel backup (behold bare siste .bak)
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

def load_config() -> Dict[str, Any]:
    try:
        with open(_CONFIG_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        # Førstegangs oppstart → skriv til disk for synlighet
        _atomic_write_json(_CONFIG_PATH, DEFAULT_CONFIG.copy())
        return DEFAULT_CONFIG.copy()
    except json.JSONDecodeError:
        # Korrupt → forsøk .bak, ellers default
        bak = _CONFIG_PATH.with_suffix(_CONFIG_PATH.suffix + ".bak")
        if bak.exists():
            try:
                with open(bak, "r", encoding="utf-8") as f:
                    data = json.load(f)
                _atomic_write_json(_CONFIG_PATH, data)
                return data
            except Exception:
                pass
        _atomic_write_json(_CONFIG_PATH, DEFAULT_CONFIG.copy())
        return DEFAULT_CONFIG.copy()

def replace_config(new_config: Dict[str, Any]) -> Dict[str, Any]:
    """Erstatt hele konfigen (full write)."""
    if not isinstance(new_config, dict):
        raise TypeError("Config must be a dict")
    new_config = dict(new_config)
    new_config.setdefault("_updated_at", int(time.time()))
    _atomic_write_json(_CONFIG_PATH, new_config)
    return new_config

def save_config(patch: Dict[str, Any]) -> Dict[str, Any]:
    """Oppdater konfig: dypflett patch inn i eksisterende (tomme felt/None ignoreres)."""
    current = load_config()
    merged = _deep_merge_preserve_empty(current, dict(patch or {}))
    merged["_updated_at"] = int(time.time())
    _atomic_write_json(_CONFIG_PATH, merged)
    return merged

# Backwards-compat aliaser (i tilfelle eksisterende kode bruker andre navn)
get_config = load_config
set_config = replace_config
update_config = save_config
