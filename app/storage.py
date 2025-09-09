from __future__ import annotations
import json, os, tempfile, re
from pathlib import Path
from typing import Any, Dict
from datetime import datetime
from .settings import CONFIG_PATH, TZ

_JSON_KW = dict(ensure_ascii=False, indent=2)

def _read_json(path: Path) -> Dict[str, Any]:
    if not path.exists():
        return {}
    with path.open("r", encoding="utf-8") as f:
        try:
            obj = json.load(f)
            return obj if isinstance(obj, dict) else {}
        except Exception:
            return {}

def _write_json_atomic(path: Path, data: Dict[str, Any]) -> None:
    d = path.parent
    d.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile("w", dir=d, delete=False, encoding="utf-8") as tmp:
        json.dump(data, tmp, **_JSON_KW)
        tmp.write("\n")
        tmp.flush()
        os.fsync(tmp.fileno())
        tmp_path = Path(tmp.name)
    tmp_path.replace(path)

def load_config() -> Dict[str, Any]:
    return _read_json(CONFIG_PATH)

def save_config_patch(patch: Dict[str, Any]) -> Dict[str, Any]:
    cfg = load_config().copy()

    # Tillat clearing for disse feltene:
    def maybe_clear(key: str, value: Any) -> bool:
        if key in {"target_datetime", "daily_time"} and (value is None or str(value).strip() in {"", "__clear__"}):
            cfg.pop(key, None)
            return True
        return False

    def keep_or_update(k: str, v: Any):
        if maybe_clear(k, v):
            return
        if v is None:
            return
        if isinstance(v, str) and v.strip() == "":
            return
        cfg[k] = v

    for k, v in patch.items():
        if k in {"warn_minutes", "alert_minutes", "blink_seconds", "overrun_minutes"}:
            try:
                v = int(v)
            except Exception:
                raise ValueError(f"Feltet {k} må være et heltall")
        keep_or_update(k, v)

    # Valider HH:MM hvis satt
    if "daily_time" in cfg:
        import re
        if not re.fullmatch(r"(?:[01]?\d|2[0-3]):[0-5]\d", str(cfg["daily_time"])):
            raise ValueError("daily_time må være HH:MM")

    # Hvis begge finnes, prioriter engangs-tidspunkt
    if cfg.get("target_datetime"):
        cfg.pop("daily_time", None)

    _write_json_atomic(CONFIG_PATH, cfg)
    return cfg

def save_target_datetime(target_dt: datetime) -> Dict[str, Any]:
    cfg = load_config().copy()
    if target_dt.tzinfo is None:
        target_dt = target_dt.replace(tzinfo=TZ)
    cfg["target_datetime"] = target_dt.astimezone(TZ).isoformat()
    cfg.pop("daily_time", None)
    _write_json_atomic(CONFIG_PATH, cfg)
    return cfg
