# File: app/storage.py
# Purpose: Konfig I/O + defaults + sanitering + trygg migrering (screen -> clock) + atomisk lagring.
#          Overlay-regler:
#            • visible_in: [] respekteres (helt skjult)
#            • visible_in: None (eksplisitt) → []
#            • overlays_mode:"replace" erstatter hele lista (inkl. []), "merge" upsert pr. id
# Replaces: app/storage.py

from __future__ import annotations

import json
import os
import re
import tempfile
import time
from datetime import datetime
from typing import Any, Dict, Tuple, List, Optional, cast

from .settings import CONFIG_PATH

_DEFAULTS: Dict[str, Any] = {
    "mode": "daily",
    "daily_time": "19:15",
    "once_at": "",
    "duration_minutes": 20,
    "duration_started_ms": 0,
    "overlays": [],
    "clock": {
        "with_seconds": True,
        "color": "#e6edf3",
        "size_vmin": 15,
        "position": "center",
        "messages_position": "right",
        "messages_align": "center",
        "use_clock_messages": False,
        "message_primary": "Velkommen!",
        "message_secondary": "",
    },
    "message_primary": "Velkommen!",
    "message_secondary": "Vi starter kl:",
    "show_message_primary": True,
    "show_message_secondary": True,
    "warn_minutes": 5,
    "alert_minutes": 3,
    "blink_seconds": 10,
    "overrun_minutes": 20,
    "show_target_time": True,
    "target_time_after": "secondary",
    "messages_position": "above",
    "use_blink": True,
    "use_phase_colors": False,
    "color_normal": "#e6edf3",
    "color_warn": "#ffd166",
    "color_alert": "#ff6b6b",
    "color_over": "#9ad0ff",
    "hms_threshold_minutes": 60,
    "theme": {
        "digits": {"size_vw": 14, "font_weight": 800, "letter_spacing_em": 0.06},
        "messages": {
            "primary": {"size_rem": 1.0, "weight": 600, "color": "#9aa4b2"},
            "secondary": {"size_rem": 1.0, "weight": 400, "color": "#9aa4b2"},
        },
        "background": {
            "mode": "solid",
            "solid": {"color": "#0b0f14"},
            "gradient": {"from": "#142033", "to": "#0b0f14", "angle_deg": 180},
            "image": {
                "url": "",
                "fit": "cover",
                "opacity": 1.0,
                "tint": {"color": "#000000", "opacity": 0.0},
            },
            "dynamic": {
                "from": "#16233a",
                "to": "#0e1a2f",
                "rotate_s": 60,
                "blur_px": 18,
                "opacity": 0.9,
            },
        },
    },
    "admin_password": None,
}

_LEGACY_REMOVE = {"target_ms", "target_iso", "target_datetime"}
_HHMM_RE = re.compile(r"^(?:[01]\d|2[0-3]):[0-5]\d$")


def get_defaults() -> Dict[str, Any]:
    return json.loads(json.dumps(_DEFAULTS))


def _atomic_write(path: str, data: Dict[str, Any]) -> None:
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
        try:
            if os.path.exists(tmp):
                os.unlink(tmp)
        except Exception:
            pass


def _deep_merge(dst: Dict[str, Any], src: Dict[str, Any]) -> Dict[str, Any]:
    for k, v in (src or {}).items():
        if isinstance(v, dict) and isinstance(dst.get(k), dict):
            _deep_merge(dst[k], v)
        else:
            dst[k] = v
    return dst


def _merge_defaults(cfg: Dict[str, Any]) -> Dict[str, Any]:
    merged = get_defaults()
    return _deep_merge(merged, cfg or {})


def _strip_legacy(cfg: Dict[str, Any]) -> Dict[str, Any]:
    for k in list(cfg.keys()):
        if k in _LEGACY_REMOVE:
            cfg.pop(k, None)
    sc = (cfg.get("screen") or {}) if isinstance(cfg.get("screen"), dict) else {}
    if cfg.get("mode") == "screen":
        cfg["mode"] = "clock"
        sclk = sc.get("clock") or {}
        clk = cfg.get("clock") or {}
        if isinstance(sclk, dict):
            clk.setdefault("with_seconds", bool(sclk.get("with_seconds", False)))
            clk.setdefault("color", sclk.get("color") or "#e6edf3")
            try:
                vh = int(sclk.get("size_vh", 12))
            except Exception:
                vh = 12
            clk.setdefault("size_vmin", max(6, min(30, vh)))
        cfg["clock"] = clk or get_defaults()["clock"]
        try:
            use_theme_bg = bool(sc.get("use_theme_background", False))
            sc_bg = sc.get("background") or {}
            if not use_theme_bg and sc_bg:
                th = cfg.get("theme") or {}
                th_bg = th.get("background") or {}
                _deep_merge(th_bg, sc_bg)
                th["background"] = th_bg
                cfg["theme"] = th
        except Exception:
            pass
    if "screen" in cfg:
        try:
            del cfg["screen"]
        except Exception:
            cfg["screen"] = None
    return cfg


def _coerce_bool(v, default: bool) -> bool:
    if isinstance(v, bool):
        return v
    if isinstance(v, str):
        s = v.strip().lower()
        if s in ("1", "true", "yes", "y", "on"):
            return True
        if s in ("0", "false", "no", "n", "off"):
            return False
    return default


def _clamp01(x, d=1.0) -> float:
    try:
        v = float(x)
    except Exception:
        v = d
    return max(0.0, min(1.0, v))


def _coerce(cfg: Dict[str, Any]) -> Dict[str, Any]:
    def _i(v, d=None):
        if v in (None, ""):
            return d
        try:
            return int(v)
        except Exception:
            return d

    for k in (
        "warn_minutes",
        "alert_minutes",
        "blink_seconds",
        "overrun_minutes",
        "duration_minutes",
        "duration_started_ms",
        "hms_threshold_minutes",
    ):
        if k in cfg:
            cfg[k] = _i(cfg[k], _DEFAULTS.get(k, 0))

    for k in ("message_primary", "message_secondary", "daily_time", "once_at"):
        if cfg.get(k) is None:
            cfg[k] = ""

    for k, d in (
        ("show_message_primary", _DEFAULTS["show_message_primary"]),
        ("show_message_secondary", _DEFAULTS["show_message_secondary"]),
        ("show_target_time", _DEFAULTS["show_target_time"]),
        ("use_blink", _DEFAULTS["use_blink"]),
        ("use_phase_colors", _DEFAULTS["use_phase_colors"]),
    ):
        cfg[k] = _coerce_bool(cfg.get(k, d), d)

    for k in (
        "target_time_after",
        "messages_position",
        "color_normal",
        "color_warn",
        "color_alert",
        "color_over",
    ):
        if cfg.get(k) is None:
            cfg[k] = _DEFAULTS[k]

    th = cfg.get("theme") or {}
    base_th = get_defaults()["theme"]
    _deep_merge(base_th, th)

    dg = base_th.get("digits", {})
    try:
        dg["size_vw"] = max(8, min(40, int(dg.get("size_vw", 14) or 14)))
    except Exception:
        dg["size_vw"] = 14
    base_th["digits"] = dg

    msg = base_th.get("messages", {})
    for key in ("primary", "secondary"):
        m = msg.get(key) or {}
        try:
            sz = float(m.get("size_rem", 1.0) or 1.0)
        except Exception:
            sz = 1.0
        m["size_rem"] = max(0.6, min(3.0, sz))
        try:
            wt = int(m.get("weight", 400) or 400)
        except Exception:
            wt = 400
        wt = 100 * round(wt / 100)
        m["weight"] = max(100, min(900, wt))
        if not isinstance(m.get("color"), str) or not m.get("color"):
            m["color"] = "#9aa4b2"
        msg[key] = m
    base_th["messages"] = msg

    bg = base_th.get("background", {})
    mode = (bg.get("mode") or "solid").lower()
    if mode not in ("solid", "gradient", "image", "dynamic"):
        mode = "solid"
    bg["mode"] = mode

    try:
        ang = int(bg.get("gradient", {}).get("angle_deg", 180))
    except Exception:
        ang = 180
    bg.setdefault("solid", {})
    bg.setdefault("gradient", {})
    bg["gradient"]["angle_deg"] = max(0, min(360, ang))
    bg.setdefault("dynamic", {})
    bg.setdefault("image", {})
    bg["image"]["opacity"] = _clamp01(bg["image"].get("opacity", 1.0), 1.0)
    bg["image"]["fit"] = bg["image"].get("fit") or "cover"
    bg["image"].setdefault("tint", {})
    bg["image"]["tint"]["opacity"] = _clamp01(
        bg["image"]["tint"].get("opacity", 0.0), 0.0
    )
    if isinstance(bg["image"].get("url"), str):
        bg["image"]["url"] = bg["image"]["url"].strip()
    
    dyn = bg["dynamic"]
    # farger – bruk defaults hvis tomt/ugyldig
    if not isinstance(dyn.get("from"), str) or not dyn.get("from"):
        dyn["from"] = _DEFAULTS["theme"]["background"]["dynamic"]["from"]
    if not isinstance(dyn.get("to"), str) or not dyn.get("to"):
        dyn["to"] = _DEFAULTS["theme"]["background"]["dynamic"]["to"]
    # tallfelt – bruk eksisterende _i fra starten av _coerce
    rot = _i(dyn.get("rotate_s"), _DEFAULTS["theme"]["background"]["dynamic"]["rotate_s"])
    blur = _i(dyn.get("blur_px"), _DEFAULTS["theme"]["background"]["dynamic"]["blur_px"])
    opa = dyn.get("opacity", _DEFAULTS["theme"]["background"]["dynamic"]["opacity"])
    dyn["rotate_s"] = max(5, min(600, rot))
    dyn["blur_px"]  = max(0, min(60,  blur))
    dyn["opacity"]  = _clamp01(opa, _DEFAULTS["theme"]["background"]["dynamic"]["opacity"])

    base_th["background"] = bg
    cfg["theme"] = base_th

    clk = cfg.get("clock") or {}
    if "size_vmin" not in clk and "size_vh" in clk:
        try:
            clk["size_vmin"] = int(clk.get("size_vh") or 12)
        except Exception:
            clk["size_vmin"] = 12
    clk["with_seconds"] = bool(clk.get("with_seconds", False))
    clk["use_clock_messages"] = bool(clk.get("use_clock_messages", False))
    if not isinstance(clk.get("color"), str) or not clk.get("color"):
        clk["color"] = "#e6edf3"
    try:
        sz = int(clk.get("size_vmin", 12) or 12)
    except Exception:
        sz = 12
    clk["size_vmin"] = max(6, min(30, sz))
    pos = (clk.get("position") or "center").strip().lower()
    if pos not in (
        "center",
        "top-left",
        "top-right",
        "bottom-left",
        "bottom-right",
        "top-center",
        "bottom-center",
    ):
        pos = "center"
    clk["position"] = pos
    mp = (clk.get("messages_position") or "right").strip().lower()
    if mp not in ("right", "left", "above", "below"):
        mp = "right"
    clk["messages_position"] = mp
    ma = (clk.get("messages_align") or "center").strip().lower()
    if ma not in ("start", "center", "end"):
        ma = "center"
    for key in ("message_primary", "message_secondary"):
        v = clk.get(key, "")
        clk[key] = v if isinstance(v, str) else ("" if v is None else str(v))
    cfg["clock"] = clk

    hm = cfg.get("hms_threshold_minutes", _DEFAULTS["hms_threshold_minutes"])
    try:
        hm = int(hm)
    except Exception:
        hm = _DEFAULTS["hms_threshold_minutes"]
    cfg["hms_threshold_minutes"] = max(0, min(720, hm))

    if not cfg.get("admin_password"):
        cfg["admin_password"] = None
    return cfg


def _validate(cfg: Dict[str, Any]) -> Tuple[bool, str]:
    m = cfg.get("mode")
    if m not in ("daily", "once", "duration", "clock"):
        return False, "mode må være daily|once|duration|clock"
    if m == "daily":
        s = (cfg.get("daily_time") or "").strip()
        if not _HHMM_RE.match(s):
            return False, "daily_time må være HH:MM (00:00–23:59)"
    if m == "once":
        s = (cfg.get("once_at") or "").strip()
        if s:
            ss = s.replace("Z", "+00:00")
            try:
                datetime.fromisoformat(ss)
            except Exception:
                return False, "once_at må være ISO-8601 (YYYY-MM-DDTHH:MM[:SS][+TZ])"
    if m == "duration":
        try:
            dm = int(cfg.get("duration_minutes") or 0)
        except Exception:
            dm = 0
        if dm <= 0:
            return False, "duration_minutes må være > 0"
    return True, ""


def _clean_by_mode(cfg: Dict[str, Any]) -> Dict[str, Any]:
    m = cfg.get("mode")
    if m == "daily":
        cfg["once_at"] = ""
        cfg["duration_started_ms"] = 0
    elif m == "once":
        cfg["duration_started_ms"] = 0
    elif m == "duration":
        cfg["once_at"] = ""
    elif m == "clock":
        cfg["once_at"] = ""
        cfg["duration_started_ms"] = 0
    return cfg


def _sanitize_overlays(seq: Any) -> List[Dict[str, Any]]:
    """
    Sanitering:
      • Hvis 'visible_in' forekommer:
          – liste  → filtrer mot {'countdown','clock'} (behold evt. tom [])
          – None    → tolk som eksplisitt tom []
        Ellers default ["countdown","clock"].
    """
    out: List[Dict[str, Any]] = []
    if not isinstance(seq, list):
        return out

    ALLOWED_POS = {
        "top-left",
        "top-center",
        "top-right",
        "center-left",
        "center",
        "center-right",
        "bottom-left",
        "bottom-center",
        "bottom-right",
    }
    ALLOWED_VISIBLE = {"countdown", "clock"}
    ALLOWED_URL_SCHEMES = ("http://", "https://", "data:")

    for idx, it in enumerate(seq, start=1):
        if not isinstance(it, dict):
            continue
        if (it.get("type") or "image") != "image":
            continue

        url = str(it.get("url") or "").strip()
        if url and not url.startswith(ALLOWED_URL_SCHEMES):
            if url.startswith("//"):
                url = "https:" + url
            elif ":" in url:
                url = ""

        pos = str(it.get("position") or "top-right").strip().lower()
        if pos not in ALLOWED_POS:
            pos = "top-right"

        # --- visible_in presist ---
        if "visible_in" in it:
            src = it.get("visible_in")
            if src is None:
                vis: List[str] = []  # eksplisitt None → [] (helt skjult)
            elif isinstance(src, list):
                vis = [v for v in src if isinstance(v, str) and v in ALLOWED_VISIBLE]
                # bevar ev. tom liste
            else:
                vis = ["countdown", "clock"]
        else:
            vis = ["countdown", "clock"]

        def _f(v: Any, d: float) -> float:
            try:
                return float(v)
            except Exception:
                return d

        try:
            z_index = int(it.get("z_index") or 10)
        except Exception:
            z_index = 10

        tint = it.get("tint") or {}
        out.append(
            {
                "id": str(it.get("id") or f"logo-{idx}"),
                "type": "image",
                "url": url,
                "position": pos,
                "size_vmin": max(2.0, min(200.0, _f(it.get("size_vmin"), 12.0))),
                "opacity": max(0.0, min(1.0, _f(it.get("opacity"), 1.0))),
                "offset_vw": _f(it.get("offset_vw"), 2.0),
                "offset_vh": _f(it.get("offset_vh"), 2.0),
                "z_index": max(-9999, min(9999, z_index)),
                "visible_in": vis,  # kan være []
                "tint": {
                    "color": str(tint.get("color") or "#000000"),
                    "opacity": max(0.0, min(1.0, float(tint.get("opacity") or 0.0))),
                    "blend": str(tint.get("blend") or "multiply").lower(),
                },
            }
        )
    return out


def _merge_overlays_by_id(
    old_list: Any, new_list: List[Dict[str, Any]]
) -> List[Dict[str, Any]]:
    old: List[Dict[str, Any]] = old_list if isinstance(old_list, list) else []
    by_id: Dict[str, Dict[str, Any]] = {
        (cast(Dict[str, Any], o).get("id") or f"_idx{i}"): dict(cast(Dict[str, Any], o))
        for i, o in enumerate(old)
    }
    for n in new_list:
        nid = cast(Optional[str], n.get("id")) or f"logo-{len(by_id)+1}"
        n = {**n, "id": nid}
        by_id[nid] = n
    return list(by_id.values())


def load_config() -> Dict[str, Any]:
    path = str(CONFIG_PATH)
    if not os.path.exists(path):
        cfg = _merge_defaults({})
        _atomic_write(path, cfg)
        return cfg
    try:
        with open(path, "r", encoding="utf-8") as f:
            cfg = json.load(f)
    except Exception:
        cfg = {}
    cfg = _merge_defaults(_strip_legacy(cfg))
    cfg = _coerce(cfg)
    ok, _ = _validate(cfg)
    if not ok:
        cfg = _merge_defaults(cfg)
    return _clean_by_mode(cfg)


def replace_config(new_cfg: Dict[str, Any]) -> Dict[str, Any]:
    cfg_in = _merge_defaults(_strip_legacy(new_cfg))
    if "overlays" in new_cfg:
        try:
            cfg_in["overlays"] = _sanitize_overlays(new_cfg.get("overlays"))
        except Exception:
            cfg_in["overlays"] = []
    cfg = _coerce(cfg_in)
    ok, msg = _validate(cfg)
    if not ok:
        raise ValueError(msg)
    cfg["_updated_at"] = int(time.time())
    cfg = _clean_by_mode(cfg)
    _atomic_write(str(CONFIG_PATH), cfg)
    return cfg


def save_config_patch(patch: Dict[str, Any]) -> Dict[str, Any]:
    current = load_config()
    merged = _merge_defaults(current)

    overlays_mode = "merge"
    if isinstance(patch, dict):
        overlays_mode = str(patch.get("overlays_mode") or "merge").lower()

    if isinstance(patch, dict) and "overlays" in patch:
        new_ov = _sanitize_overlays(patch.get("overlays"))
        if overlays_mode == "replace":
            merged["overlays"] = new_ov  # respekter også []
        else:
            if new_ov:
                merged["overlays"] = _merge_overlays_by_id(
                    merged.get("overlays"), new_ov
                )

        patch = dict(patch)
        patch.pop("overlays", None)
        patch.pop("overlays_mode", None)

    _deep_merge(merged, patch or {})
    return replace_config(merged)


def set_mode(
    mode: str,
    *,
    daily_time: str = "",
    once_at: str = "",
    duration_minutes: int | None = None,
    clock: Dict[str, Any] | None = None,
) -> Dict[str, Any]:
    cfg = load_config()
    cfg["mode"] = mode
    if mode == "daily":
        if daily_time:
            cfg["daily_time"] = daily_time
        cfg["duration_started_ms"] = 0
        cfg["once_at"] = ""
    elif mode == "once":
        cfg["once_at"] = once_at or ""
        cfg["duration_started_ms"] = 0
    elif mode == "duration":
        if duration_minutes:
            cfg["duration_minutes"] = int(duration_minutes)
    elif mode == "clock":
        if clock:
            base = _merge_defaults({"clock": {}})["clock"]
            cfg["clock"] = base
            _deep_merge(cfg["clock"], clock)
    else:
        raise ValueError("Ugyldig mode")
    return replace_config(cfg)


def start_duration(minutes: int) -> Dict[str, Any]:
    if minutes <= 0:
        raise ValueError("minutes må være > 0")
    now_ms = int(time.time() * 1000)
    cfg = load_config()
    cfg["mode"] = "duration"
    cfg["duration_minutes"] = int(minutes)
    cfg["duration_started_ms"] = now_ms
    cfg["once_at"] = ""
    return replace_config(cfg)


def clear_duration_and_switch_to_daily() -> Dict[str, Any]:
    cfg = load_config()
    cfg["duration_started_ms"] = 0
    cfg["mode"] = "daily"
    return replace_config(cfg)
