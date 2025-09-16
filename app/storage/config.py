# app/storage/config.py
"""
Konfigurasjons-håndtering (les/skriv til config.json).
Ansvar:
- Lasting og lagring av config
- Oppdatere metadata (_meta.updated_at, migrated_at, version)
- Patch av config med validering
"""

from __future__ import annotations
import json
import time
from pathlib import Path
from typing import Any, Dict

from app.settings import CONFIG_PATH
from app.storage.overlays import sanitize_overlays


# --- intern meta-hjelpere ---

def _ensure_meta(cfg: Dict[str, Any]) -> None:
    """Sørg for at _meta finnes og har fornuftige defaults."""
    meta = cfg.setdefault("_meta", {})
    meta.setdefault("version", 1)
    meta.setdefault("migrated_at", int(time.time()))
    meta.setdefault("updated_at", int(time.time()))


def _touch_updated(cfg: Dict[str, Any]) -> None:
    """Oppdater updated_at i _meta."""
    meta = cfg.setdefault("_meta", {})
    meta["updated_at"] = int(time.time())


# --- I/O-funksjoner ---

def get_config() -> Dict[str, Any]:
    """Last config.json, opprett hvis mangler."""
    if not CONFIG_PATH.exists():
        cfg: Dict[str, Any] = {}
        _ensure_meta(cfg)
        replace_config(cfg)
        return cfg

    with open(CONFIG_PATH, "r", encoding="utf-8") as f:
        cfg: Dict[str, Any] = json.load(f)

    _ensure_meta(cfg)
    return cfg


def replace_config(cfg: Dict[str, Any]) -> None:
    """Skriv full config til disk med oppdatert updated_at."""
    _touch_updated(cfg)
    CONFIG_PATH.write_text(
        json.dumps(cfg, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )


def patch_config(patch: Dict[str, Any]) -> Dict[str, Any]:
    """
    Patch eksisterende config (merge) og lagre.
    Brukes av API-et.
    """
    cfg = get_config()

    # overlays må saniteres separat
    if "overlays" in patch:
        patch["overlays"] = sanitize_overlays(patch["overlays"])

    # enkel merge (flat)
    for k, v in patch.items():
        cfg[k] = v

    replace_config(cfg)
    return cfg


def replace_config(new_cfg: Dict[str, Any]) -> None:
    """Erstatt hele config (brukes i debug)."""
    if "overlays" in new_cfg:
        new_cfg["overlays"] = sanitize_overlays(new_cfg["overlays"])
    _ensure_meta(new_cfg)
    replace_config(new_cfg)
