import json
import os
import tempfile
import time
from typing import Any, Dict
from app.settings import CONFIG_PATH
from .defaults import get_defaults
from .normalize import coerce_config
from .validate import validate_config, clean_by_mode
from .overlays import sanitize_overlays
from .utils import deep_merge

def atomic_write(path: str, data: Dict[str, Any]) -> None:
    """Skriv data atomisk til fil."""
    dirpath = os.path.dirname(path) or "."
    os.makedirs(dirpath, exist_ok=True)

    fd, tmp = tempfile.mkstemp(prefix=".config.", dir=dirpath)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2, sort_keys=True)
            f.write("\n")
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp, path)
    finally:
        if os.path.exists(tmp):
            os.unlink(tmp)


def load_config() -> Dict[str, Any]:
    """Last config fra disk, bruk defaults hvis ikke finnes."""
    path = str(CONFIG_PATH)
    if not os.path.exists(path):
        cfg = get_defaults()
        atomic_write(path, cfg)
        return cfg
    try:
        with open(path, "r", encoding="utf-8") as f:
            cfg = json.load(f)
    except Exception:
        cfg = {}

    cfg = deep_merge(get_defaults(), cfg or {})
    cfg = coerce_config(cfg)
    ok, _ = validate_config(cfg)
    if not ok:
        cfg = get_defaults()
    return clean_by_mode(cfg)


def replace_config(new_cfg: Dict[str, Any]) -> Dict[str, Any]:
    """Erstatt hele config med en ny versjon (sanitert)."""
    cfg_in = deep_merge(get_defaults(), new_cfg)

    if "overlays" in new_cfg:
        cfg_in["overlays"] = sanitize_overlays(new_cfg.get("overlays"))

    cfg = coerce_config(cfg_in)
    ok, msg = validate_config(cfg)
    if not ok:
        raise ValueError(msg)

    cfg["_updated_at"] = int(time.time())
    cfg = clean_by_mode(cfg)

    atomic_write(str(CONFIG_PATH), cfg)
    return cfg
