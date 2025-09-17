# app/storage/io.py
from __future__ import annotations
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


def _atomic_write_path(path: str, data: str) -> None:
    dirpath = os.path.dirname(path) or "."
    os.makedirs(dirpath, exist_ok=True)
    fd, tmp_path = tempfile.mkstemp(prefix=".cfg.", dir=dirpath)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write(data)
        os.replace(tmp_path, path)
    finally:
        try:
            if os.path.exists(tmp_path):
                os.remove(tmp_path)
        except Exception:
            pass


def _ensure_meta(cfg: Dict[str, Any]) -> None:
    meta = cfg.get("_meta")
    if not isinstance(meta, dict):
        meta = {}
        cfg["_meta"] = meta
    if "version" not in meta:
        meta["version"] = 1
    if "migrated_at" not in meta:
        meta["migrated_at"] = int(time.time())
    # updated_at settes av replace_config ved skriving


def load_config() -> Dict[str, Any]:
    """Les config, legg på defaults og normaliser/valider."""
    defaults = get_defaults()
    if not os.path.exists(CONFIG_PATH):
        cfg = defaults
        _ensure_meta(cfg)
        cfg["_meta"]["updated_at"] = int(time.time())
        _atomic_write_path(
            str(CONFIG_PATH), json.dumps(cfg, ensure_ascii=False, indent=2)
        )
        return cfg

    try:
        with open(CONFIG_PATH, "r", encoding="utf-8") as f:
            raw = json.load(f)
    except Exception:
        raw = {}

    # Merge defaults <- raw (raw vinner)
    cfg_in = deep_merge(defaults, raw or {})

    # Saniter lister/overlays hvis tilstede
    if "overlays" in cfg_in:
        cfg_in["overlays"] = sanitize_overlays(cfg_in.get("overlays"))

    # Coerce/validate/clean
    cfg = coerce_config(cfg_in)
    ok, msg = validate_config(cfg)
    if not ok:
        raise ValueError(msg)
    cfg = clean_by_mode(cfg)

    _ensure_meta(cfg)
    return cfg


def replace_config(new_cfg: Dict[str, Any]) -> Dict[str, Any]:
    """Erstatt hele config og skriv til disk."""
    defaults = get_defaults()
    cfg_in = deep_merge(defaults, new_cfg or {})

    if "overlays" in cfg_in:
        cfg_in["overlays"] = sanitize_overlays(cfg_in.get("overlays"))

    cfg = coerce_config(cfg_in)
    ok, msg = validate_config(cfg)
    if not ok:
        raise ValueError(msg)

    cfg = clean_by_mode(cfg)

    _ensure_meta(cfg)
    cfg["_meta"]["updated_at"] = int(time.time())

    _atomic_write_path(str(CONFIG_PATH), json.dumps(cfg, ensure_ascii=False, indent=2))
    return cfg
