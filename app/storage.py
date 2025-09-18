# app/storage.py
"""
Konfig I/O + defaults.
Nytt: 'clock' er kanonisk modus. All 'screen' legacy migreres bort ved lesing.
- Klokke bruker alltid theme.background.
- Engangsmigrering: mode=screen -> mode=clock, screen.clock -> clock.
"""
from __future__ import annotations
import json
import os
import tempfile
import time
from typing import Any, Dict, Tuple
from datetime import datetime
from .settings import CONFIG_PATH

# -------- Defaults --------
_DEFAULTS: Dict[str, Any] = {
    "mode": "daily",  # daily|once|duration|clock
    "daily_time": "19:15",
    "once_at": "",
    "duration_minutes": 20,
    "duration_started_ms": 0,
    "overlays": [],
    # Klokke (top-level, brukes når mode=clock)
    "clock": {
        "with_seconds": True,
        "color": "#e6edf3",
        "size_vmin": 15,  # relativ skriftstørrelse (vmin), 6..30 anbefalt
        "position": "center",  # center|top-left|top-right|bottom-left|bottom-right|top-center|bottom-center
        "messages_position": "right",  # right|left|above|below
        "messages_align": "center",  # start|center|end
        "use_clock_messages": False,  # true => bruk tekst under (ellers global message_*)
        "message_primary": "Velkommen!",
        "message_secondary": "",
    },
    # Meldinger (innhold)
    "message_primary": "Velkommen!",
    "message_secondary": "Vi starter kl:",
    "show_message_primary": True,
    "show_message_secondary": True,
    # Varsler/blink (logikk)
    "warn_minutes": 5,
    "alert_minutes": 3,
    "blink_seconds": 10,
    "overrun_minutes": 20,
    # Visning / oppførsel
    "show_target_time": True,
    "target_time_after": "secondary",  # primary|secondary
    "messages_position": "above",  # above|below
    "use_blink": True,
    "use_phase_colors": False,
    "color_normal": "#e6edf3",
    "color_warn": "#ffd166",
    "color_alert": "#ff6b6b",
    "color_over": "#9ad0ff",
    "hms_threshold_minutes": 60,  # clamp [0,720]
    # Theme for selve visningen (brukes også i klokke-modus)
    "theme": {
        "digits": {"size_vw": 14, "font_weight": 800, "letter_spacing_em": 0.06},
        "messages": {
            "primary": {"size_rem": 1.0, "weight": 600, "color": "#9aa4b2"},
            "secondary": {"size_rem": 1.0, "weight": 400, "color": "#9aa4b2"},
        },
        "background": {
            "mode": "solid",  # solid|gradient|image
            "solid": {"color": "#0b0f14"},
            "gradient": {"from": "#142033", "to": "#0b0f14", "angle_deg": 180},
            "image": {
                "url": "",
                "fit": "cover",
                "opacity": 1.0,
                "tint": {"color": "#000000", "opacity": 0.0},
            },
        },
    },
    "admin_password": None,
}

# Legacy nøkler som skal fjernes direkte
_LEGACY = {"target_ms", "target_iso", "target_datetime"}


def get_defaults() -> Dict[str, Any]:
    return json.loads(json.dumps(_DEFAULTS))


# -------- IO helpers --------
def _atomic_write(path: str, data: Dict[str, Any]) -> None:
    # tåler at CONFIG_PATH er i repo-rot (dirname == '')
    dirpath = os.path.dirname(path) or "."
    os.makedirs(dirpath, exist_ok=True)

    fd, tmp = tempfile.mkstemp(prefix=".config.", dir=dirpath)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2, sort_keys=True)
            f.write("\n")
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp, path)  # atomic swap på samme fs
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


# -------- Legacy/migrering --------
def _strip_legacy(cfg: Dict[str, Any]) -> Dict[str, Any]:
    # fjern helt gamle felt
    for k in list(cfg.keys()):
        if k in _LEGACY:
            cfg.pop(k, None)

    # Engangsmigrering fra "screen" → "clock"
    # - mode: screen -> clock
    # - clock-oppsett hentes fra screen.clock om det finnes
    sc = (cfg.get("screen") or {}) if isinstance(cfg.get("screen"), dict) else {}
    if cfg.get("mode") == "screen":
        cfg["mode"] = "clock"  # bytt kanonisk modus
        # Ta med klokkeinnstillinger dersom de fantes
        sclk = sc.get("clock") or {}
        clk = cfg.get("clock") or {}
        # suppler/overstyr med screen.clock
        if isinstance(sclk, dict):
            clk.setdefault("with_seconds", bool(sclk.get("with_seconds", False)))
            clk.setdefault("color", sclk.get("color") or "#e6edf3")
            try:
                clk.setdefault("size_vh", max(6, min(30, int(sclk.get("size_vh", 12)))))
            except Exception:
                clk.setdefault("size_vh", 12)
        cfg["clock"] = clk or get_defaults()["clock"]

        # Valgfritt: dersom screen.use_theme_background==False og egen background var satt,
        # kan vi migrere denne inn i theme.background så visningen bevarer utseendet.
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

    # Fjern screen-blokken helt dersom den ligger igjen
    if "screen" in cfg:
        try:
            del cfg["screen"]
        except Exception:
            cfg["screen"] = None
    return cfg


# -------- Typing/normalisering --------
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

    # Theme (digits/messages/background)
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
    if mode not in ("solid", "gradient", "image"):
        mode = "solid"
    bg["mode"] = mode
    try:
        ang = int(bg.get("gradient", {}).get("angle_deg", 180))
    except Exception:
        ang = 180
    bg.setdefault("gradient", {})
    bg["gradient"]["angle_deg"] = max(0, min(360, ang))
    bg.setdefault("image", {})
    bg["image"]["opacity"] = _clamp01(bg["image"].get("opacity", 1.0), 1.0)
    bg["image"]["fit"] = bg["image"].get("fit") or "cover"
    bg["image"].setdefault("tint", {})
    bg["image"]["tint"]["opacity"] = _clamp01(
        bg["image"]["tint"].get("opacity", 0.0), 0.0
    )
    base_th["background"] = bg
    cfg["theme"] = base_th

    # Clock
    clk = cfg.get("clock") or {}
    # migrering fra ev. gammel 'size_vh' -> 'size_vmin'
    if "size_vmin" not in clk and "size_vh" in clk:
        try:
            clk["size_vmin"] = int(clk.get("size_vh") or 12)
        except Exception:
            clk["size_vmin"] = 12

    # boolean
    clk["with_seconds"] = bool(clk.get("with_seconds", False))
    clk["use_clock_messages"] = bool(clk.get("use_clock_messages", False))

    # farge
    if not isinstance(clk.get("color"), str) or not clk.get("color"):
        clk["color"] = "#e6edf3"

    # størrelse
    try:
        sz = int(clk.get("size_vmin", 12) or 12)
    except Exception:
        sz = 12
    clk["size_vmin"] = max(6, min(30, sz))

    # posisjon av selve klokka
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

    # plassering/jusering av meldinger i klokkemodus
    mp = (clk.get("messages_position") or "right").strip().lower()
    if mp not in ("right", "left", "above", "below"):
        mp = "right"
    clk["messages_position"] = mp

    ma = (clk.get("messages_align") or "center").strip().lower()
    if ma not in ("start", "center", "end"):
        ma = "center"
    clk["messages_align"] = ma

    # egne klokke-meldinger (valgfritt)
    for key in ("message_primary", "message_secondary"):
        v = clk.get(key, "")
        clk[key] = v if isinstance(v, str) else ("" if v is None else str(v))

    cfg["clock"] = clk

    # terskel
    hm = cfg.get("hms_threshold_minutes", _DEFAULTS["hms_threshold_minutes"])
    cfg["hms_threshold_minutes"] = max(0, min(720, hm))
    return cfg


# -------- Validering/renhold --------
def _validate(cfg: Dict[str, Any]) -> Tuple[bool, str]:
    m = cfg.get("mode")
    if m not in ("daily", "once", "duration", "clock"):
        return False, "mode må være daily|once|duration|clock"

    if m == "daily":
        s = (cfg.get("daily_time") or "").strip()
        if len(s) != 5 or ":" not in s:
            return False, "daily_time må være HH:MM"

    if m == "once":
        s = (cfg.get("once_at") or "").strip()
        if s:
            ss = s.replace("Z", "+00:00")  # Python liker ikke 'Z'
            try:
                datetime.fromisoformat(ss)
            except Exception:
                return False, "once_at må være ISO (YYYY-MM-DDTHH:MM eller med tz)"

    if m == "duration" and int(cfg.get("duration_minutes") or 0) <= 0:
        return False, "duration_minutes må være > 0"

    # clock har ingen ekstra feltkrav
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


# -------- Offentlige APIer --------
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
    # Start med defaults + strip legacy
    cfg_in = _merge_defaults(_strip_legacy(new_cfg))

    # 🔧 Viktig: Sanitér overlays TIDLIG og skriv inn i cfg_in før coerce/validate
    if "overlays" in new_cfg:
        try:
            cfg_in["overlays"] = _sanitize_overlays(new_cfg.get("overlays"))
        except Exception:
            cfg_in["overlays"] = []

    # Vanlig rør
    cfg = _coerce(cfg_in)
    ok, msg = _validate(cfg)
    if not ok:
        raise ValueError(msg)

    cfg["_updated_at"] = int(time.time())
    cfg = _clean_by_mode(cfg)

    _atomic_write(str(CONFIG_PATH), cfg)
    return cfg


def _sanitize_overlays(seq):
    out = []
    if not isinstance(seq, list):
        return out
    allowed_pos = {
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
    for it in seq:
        if not isinstance(it, dict):
            continue
        if (it.get("type") or "image") != "image":
            continue
        tint = it.get("tint") or {}
        o = {
            "id": str(it.get("id") or f"logo-{len(out)+1}"),
            "type": "image",
            "url": str(it.get("url") or ""),
            "position": str(it.get("position") or "top-right"),
            "size_vmin": max(
                2.0, min(200.0, float(it.get("size_vmin") or 30))
            ),  # 2..200
            "opacity": max(0.0, min(1.0, float(it.get("opacity") or 1))),
            "offset_vw": float(it.get("offset_vw") or 2),
            "offset_vh": float(it.get("offset_vh") or 2),
            "z_index": int(it.get("z_index") or 10),
            "visible_in": [
                v
                for v in (it.get("visible_in") or ["countdown", "clock"])
                if isinstance(v, str)
            ],
            "tint": {
                "color": str(tint.get("color") or "#000000"),
                "opacity": max(0.0, min(1.0, float(tint.get("opacity") or 0))),
                "blend": str(tint.get("blend") or "multiply"),
            },
        }

        if o["position"] not in allowed_pos:
            o["position"] = "top-right"
        out.append(o)
    return out


def save_config_patch(patch: Dict[str, Any]) -> Dict[str, Any]:
    current = load_config()
    merged = _merge_defaults(current)
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
