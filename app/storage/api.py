# app/storage/api.py
from __future__ import annotations
import time
from typing import Any, Dict
from .io import load_config as _load_config, replace_config as _replace_config

__all__ = ["get_config", "patch_config", "replace_config"]


def get_config() -> Dict[str, Any]:
    return _load_config()


def patch_config(patch: Dict[str, Any]) -> Dict[str, Any]:
    cfg = _load_config()
    for k, v in (patch or {}).items():
        cfg[k] = v
    cfg["_meta"] = cfg.get("_meta", {})
    cfg["_meta"]["updated_at"] = int(time.time())
    return _replace_config(cfg)


def replace_config(new_cfg: Dict[str, Any]) -> Dict[str, Any]:
    cfg = dict(new_cfg or {})
    cfg["_meta"] = cfg.get("_meta", {})
    cfg["_meta"]["version"] = cfg["_meta"].get("version", 1)
    cfg["_meta"]["migrated_at"] = cfg["_meta"].get("migrated_at", int(time.time()))
    cfg["_meta"]["updated_at"] = int(time.time())
    return _replace_config(cfg)
