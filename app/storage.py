# File: app/storage.py
# Purpose: Enkelt, moderne config-IO uten legacy. Kun size_vmin. Lager 'layer' i dynamic-bg.

from __future__ import annotations
import json, os, tempfile, time
from typing import Any, Dict, Tuple, List, Optional, cast
from datetime import datetime
from .settings import CONFIG_PATH
from collections import OrderedDict
from typing import Mapping


# ── defaults ──────────────────────────────────────────────────────────────────
_DEFAULTS: Dict[str, Any] = {
    "mode": "daily",
    "daily_time": "19:15",
    "once_at": "",
    "duration_minutes": 20,
    "duration_started_ms": 0,
    "show_target_time": True,
    "target_time_after": "secondary",
    "messages_position": "above",
    "message_primary": "Velkommen!",
    "message_secondary": "Vi starter kl:",
    "show_message_primary": True,
    "show_message_secondary": True,
    "warn_minutes": 5,
    "alert_minutes": 3,
    "blink_seconds": 10,
    "overrun_minutes": 20,
    "hms_threshold_minutes": 60,
    "use_phase_colors": False,
    "use_blink": True,
    "color_normal": "#e6edf3",
    "color_warn": "#ffd166",
    "color_alert": "#ff6b6b",
    "color_over": "#9ad0ff",
    "theme": {
        "digits": {"size_vmin": 14, "font_weight": 800, "letter_spacing_em": 0.06},
        "messages": {
            "primary": {"size_vmin": 6, "weight": 600, "color": "#9aa4b2"},
            "secondary": {"size_vmin": 4, "weight": 400, "color": "#9aa4b2"},
        },
        "background": {
            "mode": "solid",
            "solid": {"color": "#0b0f14"},
            "gradient": {"from": "#142033", "to": "#0b0f14", "angle_deg": 160},
            "image": {
                "url": "",
                "fit": "cover",
                "opacity": 1.0,
                "tint": {"color": "#A66F6F", "opacity": 0.0},
            },
            "dynamic": {
                "from": "#16233a",
                "to": "#0e1a2f",
                "rotate_s": 40,
                "blur_px": 25,
                "opacity": 0.8,
                "base_mode": "auto",
                "layer": "under",  # viktig: denne skal alltid persisteres
            },
            "picsum": {
                "fit": "cover",           # 'cover' | 'contain'
                "grayscale": False,       # bool
                "blur": 0,                # 0..10 (Picsum støtter 1..10; 0 = av)
                "lock_seed": False,       # hvis True → bruk 'seed' stabilt
                "seed": "",               # valgfri seed (brukes kun hvis lock_seed=True)
                "tint": {                 # samme struktur som image.tint
                    "color": "#000000",
                    "opacity": 0.0
                }
            },
        },
    },
    "clock": {
        "with_seconds": True,
        "color": "#e6edf3",
        "size_vmin": 15,
        "position": "center",
        "messages_position": "center",
        "messages_align": "center",
        "use_clock_messages": False,
        "message_primary": "Velkommen!",
        "message_secondary": "",
    },
    "overlays": [],
    "admin_password": None,
}

# --- compact JSON support for selected lists ---------------------------------
class _CompactList(list):
    """Marker lister som skal skrives som ett objekt per linje."""
    pass


def _mark_compact_lists(obj):
    """
    Gå rekursivt gjennom objektet og pakk bestemte lister i _CompactList,
    slik at de skrives med ett element per linje.
    """
    if isinstance(obj, dict) or isinstance(obj, OrderedDict):
        out = OrderedDict(obj) if isinstance(obj, OrderedDict) else dict(obj)
        for k, v in list(out.items()):
            if k == "picsum_catalog" and isinstance(v, list):
                out[k] = _CompactList(v)
            else:
                out[k] = _mark_compact_lists(v)
        return out
    elif isinstance(obj, list):
        return [_mark_compact_lists(x) for x in obj]
    return obj


# ── utils ─────────────────────────────────────────────────────────────────────
def get_defaults() -> Dict[str, Any]:
    return json.loads(json.dumps(_DEFAULTS))  # dyp kopi

def _order_like_defaults(defaults: Mapping[str, Any], data: Dict[str, Any]) -> "OrderedDict[str, Any]":
    """
    Bygg en OrderedDict for `data` som følger nøkkelrekkefølgen i `defaults`.
    - Rekursiv for nested dicts (bare når både defaults[k] og data[k] er dict).
    - Nøkler som finnes i data men ikke i defaults legges til til slutt, i sin nåværende rekkefølge.
    """
    ordered: "OrderedDict[str, Any]" = OrderedDict()
    # 1) nøkler definert i defaults – i samme rekkefølge
    for k in defaults.keys():
        if k in data:
            dv = data[k]
            dv_def = defaults[k]
            if isinstance(dv_def, dict) and isinstance(dv, dict):
                ordered[k] = _order_like_defaults(dv_def, dv)
            else:
                ordered[k] = dv
    # 2) eventuelle ekstra nøkler i data som ikke finnes i defaults
    for k, dv in data.items():
        if k in ordered:
            continue
        if isinstance(dv, dict) and isinstance(defaults.get(k), dict):
            ordered[k] = _order_like_defaults(defaults[k], dv)  # type: ignore[index]
        else:
            ordered[k] = dv
    return ordered


# --- robust, stabil JSON-dumper med støtte for _CompactList -------------------
def _write_json_value(fp, value: Any, indent: int, level: int) -> None:
    """Skriver JSON-verdier deterministisk. Unngår private encoder-APIer."""
    sp_cur = " " * (indent * level)
    sp_inn = " " * (indent * (level + 1))

    if isinstance(value, dict) or isinstance(value, OrderedDict):
        items = list(value.items())
        if not items:
            fp.write("{}")
            return
        fp.write("{\n")
        for i, (k, v) in enumerate(items):
            fp.write(f"{sp_inn}{json.dumps(k, ensure_ascii=False)}: ")
            _write_json_value(fp, v, indent, level + 1)
            if i < len(items) - 1:
                fp.write(",\n")
            else:
                fp.write("\n")
        fp.write(f"{sp_cur}}}")
        return

    if isinstance(value, list):
        # Kompakt én-linje-per-objekt for _CompactList
        if isinstance(value, _CompactList):
            if not value:
                fp.write("[]")
                return
            fp.write("[\n")
            # Bevisst enkel-objekt-encoding for elementene
            lines = []
            for it in value:
                # Viktig: enkeltobjekter kompakt, men fortsatt gyldig JSON
                lines.append(f"{sp_inn}{json.dumps(it, ensure_ascii=False, separators=(',', ': '))}")
            fp.write(",\n".join(lines))
            fp.write(f"\n{sp_cur}]")
            return

        # Vanlige lister: pent med indent
        if not value:
            fp.write("[]")
            return
        fp.write("[\n")
        for i, it in enumerate(value):
            fp.write(sp_inn)
            _write_json_value(fp, it, indent, level + 1)
            if i < len(value) - 1:
                fp.write(",\n")
            else:
                fp.write("\n")
        fp.write(f"{sp_cur}]")
        return

    # Skalarer
    fp.write(json.dumps(value, ensure_ascii=False))


def _dump_json_to_file(fp, obj: Any, indent: int = 2) -> None:
    """Skriver `obj` til fp med ønsket layout og avsluttende linjeskift."""
    _write_json_value(fp, obj, indent=indent, level=0)
    fp.write("\n")


def _atomic_write(path: str, data: Dict[str, Any]) -> None:
    """
    Atomisk skriving til path.
    - Rekkefølgen styres av _DEFAULTS (rekursivt), ikke alfabetisk sortering.
    - Ekstra nøkler (ikke i defaults) plasseres etter defaults-seksjonen.
    - Lister som er merket med _CompactList skrives kompakt (ett element per linje).
    """
    dirpath = os.path.dirname(path) or "."
    os.makedirs(dirpath, exist_ok=True)

    # 1) Kanoniser rekkefølge etter _DEFAULTS
    serializable = _order_like_defaults(_DEFAULTS, data)

    # 2) Merk lister som skal være kompakte (f.eks. "picsum_catalog")
    serializable = _mark_compact_lists(serializable)

    # 3) Dump med robust egen-dumper (unngår private json internals)
    fd, tmp = tempfile.mkstemp(prefix=".config.", dir=dirpath)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            _dump_json_to_file(f, serializable, indent=2)
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

def _clamp01(x, d=1.0) -> float:
    try: v = float(x)
    except Exception: v = d
    return max(0.0, min(1.0, v))

def _i(v, d=None):
    if v in (None, ""): return d
    try: return int(v)
    except Exception: return d

def _b(v, d: bool) -> bool:
    if isinstance(v, bool): return v
    if isinstance(v, str):
        s = v.strip().lower()
        if s in ("1","true","yes","y","on"): return True
        if s in ("0","false","no","n","off"): return False
    return d

# ── coerce/validate/clean ─────────────────────────────────────────────────────
def _coerce(cfg: Dict[str, Any]) -> Dict[str, Any]:
    # ints
    for k in ("warn_minutes","alert_minutes","blink_seconds","overrun_minutes",
              "duration_minutes","duration_started_ms","hms_threshold_minutes"):
        if k in cfg: cfg[k] = _i(cfg[k], _DEFAULTS.get(k, 0))

    # strings
    for k in ("message_primary","message_secondary","daily_time","once_at"):
        if cfg.get(k) is None: cfg[k] = ""

    # bools
    for k, d in (
        ("show_message_primary", _DEFAULTS["show_message_primary"]),
        ("show_message_secondary", _DEFAULTS["show_message_secondary"]),
        ("show_target_time", _DEFAULTS["show_target_time"]),
        ("use_blink", _DEFAULTS["use_blink"]),
        ("use_phase_colors", _DEFAULTS["use_phase_colors"]),
    ):
        cfg[k] = _b(cfg.get(k, d), d)

    for k in ("target_time_after","messages_position","color_normal","color_warn","color_alert","color_over"):
        if cfg.get(k) is None: cfg[k] = _DEFAULTS[k]

    # theme
    th = _deep_merge(get_defaults()["theme"], cfg.get("theme") or {})

    # digits: kun size_vmin
    dg = th.get("digits", {}) or {}
    try: sz = float(dg.get("size_vmin", _DEFAULTS["theme"]["digits"]["size_vmin"]))
    except Exception: sz = float(_DEFAULTS["theme"]["digits"]["size_vmin"])
    dg["size_vmin"] = max(4.0, min(60.0, sz))
    # sørg for at legacy-felter ikke finnes
    dg.pop("size_vw", None); dg.pop("size_vh", None)
    th["digits"] = dg

    # messages
    msg = th.get("messages", {}) or {}
    for key in ("primary","secondary"):
        m = msg.get(key) or {}
        try: m_sz = float(m.get("size_vmin", _DEFAULTS["theme"]["messages"][key]["size_vmin"]))
        except Exception: m_sz = float(_DEFAULTS["theme"]["messages"][key]["size_vmin"])
        m["size_vmin"] = max(2.0, min(50.0, m_sz))
        try: wt = int(m.get("weight", _DEFAULTS["theme"]["messages"][key]["weight"]))
        except Exception: wt = _DEFAULTS["theme"]["messages"][key]["weight"]
        m["weight"] = max(100, min(900, 100 * round(wt/100)))
        if not isinstance(m.get("color"), str) or not m.get("color"):
            m["color"] = _DEFAULTS["theme"]["messages"][key]["color"]
        msg[key] = m
    th["messages"] = msg

    # background
    # --- background (ERSTATT hele eksisterende blokk med denne) ---
    bg = th.get("background") or {}

    mode = (bg.get("mode") or "solid").lower()
    if mode not in ("solid", "gradient", "image", "dynamic", "picsum"):
        mode = "solid"
    bg["mode"] = mode

    # gradient
    g = bg.get("gradient") or {}
    try:
        ang = int(g.get("angle_deg", 180))
    except Exception:
        ang = 180
    g["angle_deg"] = max(0, min(360, ang))
    bg["gradient"] = g

    # image
    im = bg.get("image") or {}
    im["opacity"] = _clamp01(im.get("opacity", 1.0), 1.0)
    im["fit"] = (im.get("fit") or "cover").lower()
    im.setdefault("tint", {})
    im["tint"]["opacity"] = _clamp01(im["tint"].get("opacity", 0.0), 0.0)
    if isinstance(im.get("url"), str):
        im["url"] = im["url"].strip()
    bg["image"] = im

    # dynamic
    dyn = bg.get("dynamic") or {}
    if not isinstance(dyn.get("from"), str) or not dyn.get("from"):
        dyn["from"] = _DEFAULTS["theme"]["background"]["dynamic"]["from"]
    if not isinstance(dyn.get("to"), str) or not dyn.get("to"):
        dyn["to"] = _DEFAULTS["theme"]["background"]["dynamic"]["to"]
    dyn["rotate_s"] = max(5, min(600, _i(dyn.get("rotate_s"), _DEFAULTS["theme"]["background"]["dynamic"]["rotate_s"])))
    dyn["blur_px"] = max(0, min(60, _i(dyn.get("blur_px"), _DEFAULTS["theme"]["background"]["dynamic"]["blur_px"])))
    dyn["opacity"] = _clamp01(dyn.get("opacity", _DEFAULTS["theme"]["background"]["dynamic"]["opacity"]),
                            _DEFAULTS["theme"]["background"]["dynamic"]["opacity"])
    bm = str(dyn.get("base_mode", "auto")).lower()
    if bm not in ("auto", "solid", "gradient", "image"):
        bm = "auto"
    dyn["base_mode"] = bm
    layer = str(dyn.get("layer", "under")).lower()
    if layer not in ("under", "over"):
        layer = "under"
    dyn["layer"] = layer
    bg["dynamic"] = dyn

    # picsum
    pc = bg.get("picsum") or {}
    pc["fit"] = (pc.get("fit") or "cover").lower()
    if pc["fit"] not in ("cover", "contain"):
        pc["fit"] = "cover"
    try:
        bval = int(pc.get("blur", 0) or 0)
    except Exception:
        bval = 0
    pc["blur"] = max(0, min(10, bval))
    pc["grayscale"] = bool(pc.get("grayscale", False))
    pc["lock_seed"] = bool(pc.get("lock_seed", False))
    pc["seed"] = str(pc.get("seed") or "")
    tint = pc.get("tint") or {}
    pc["tint"] = {
        "color": str(tint.get("color") or "#000000"),
        "opacity": max(0.0, min(1.0, float(tint.get("opacity") or 0.0))),
    }
    bg["picsum"] = pc

    th["background"] = bg
    cfg["theme"] = th
    # --- /background ---

    # clock
    clk = _deep_merge(get_defaults()["clock"], cfg.get("clock") or {})
    clk["with_seconds"] = bool(clk.get("with_seconds", False))
    clk["use_clock_messages"] = bool(clk.get("use_clock_messages", False))
    if not isinstance(clk.get("color"), str) or not clk.get("color"):
        clk["color"] = "#e6edf3"
    try: csz = int(clk.get("size_vmin", 12) or 12)
    except Exception: csz = 12
    clk["size_vmin"] = max(6, min(30, csz))
    pos = (clk.get("position") or "center").strip().lower()
    if pos not in ("center","top-left","top-right","bottom-left","bottom-right","top-center","bottom-center"):
        pos = "center"
    clk["position"] = pos
    mp = (clk.get("messages_position") or "right").strip().lower()
    if mp not in ("right","left","above","below"): mp = "right"
    clk["messages_position"] = mp
    ma = (clk.get("messages_align") or "center").strip().lower()
    if ma not in ("start","center","end"): ma = "center"
    for key in ("message_primary","message_secondary"):
        v = clk.get(key, "")
        clk[key] = v if isinstance(v, str) else ("" if v is None else str(v))
    cfg["clock"] = clk

    # hms threshold
    hm = _i(cfg.get("hms_threshold_minutes"), _DEFAULTS["hms_threshold_minutes"])
    cfg["hms_threshold_minutes"] = max(0, min(720, hm))

    # admin pw
    if not cfg.get("admin_password"): cfg["admin_password"] = None
    return cfg

def _validate(cfg: Dict[str, Any]) -> Tuple[bool, str]:
    m = cfg.get("mode")
    if m not in ("daily","once","duration","clock"):
        return False, "mode må være daily|once|duration|clock"
    if m == "daily":
        s = (cfg.get("daily_time") or "").strip()
        ok = len(s)==5 and s[2]==":" and s[:2].isdigit() and s[3:].isdigit() and 0<=int(s[:2])<=23 and 0<=int(s[3:])<=59
        if not ok: return False, "daily_time må være HH:MM (00:00–23:59)"
    if m == "once":
        s = (cfg.get("once_at") or "").strip()
        if s:
            try:
                datetime.fromisoformat(s.replace("Z","+00:00"))
            except Exception:
                return False, "once_at må være ISO-8601 (YYYY-MM-DDTHH:MM[:SS][+TZ])"
    if m == "duration":
        try: dm = int(cfg.get("duration_minutes") or 0)
        except Exception: dm = 0
        if dm <= 0: return False, "duration_minutes må være > 0"
    return True, ""

def _clean_by_mode(cfg: Dict[str, Any]) -> Dict[str, Any]:
    m = cfg.get("mode")
    if m == "daily":
        cfg["once_at"] = ""; cfg["duration_started_ms"] = 0
    elif m == "once":
        cfg["duration_started_ms"] = 0
    elif m == "duration":
        cfg["once_at"] = ""
    elif m == "clock":
        cfg["once_at"] = ""; cfg["duration_started_ms"] = 0
    return cfg

# ── overlays ──────────────────────────────────────────────────────────────────
def _sanitize_overlays(seq: Any) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    if not isinstance(seq, list): return out

    ALLOWED_POS = {
        "top-left","top-center","top-right",
        "center-left","center","center-right",
        "bottom-left","bottom-center","bottom-right",
    }
    ALLOWED_VISIBLE = {"countdown","clock"}
    ALLOWED_URL_SCHEMES = ("http://","https://","data:")

    for idx, it in enumerate(seq, start=1):
        if not isinstance(it, dict): continue
        if (it.get("type") or "image") != "image": continue

        url = str(it.get("url") or "").strip()
        if url and not url.startswith(ALLOWED_URL_SCHEMES):
            if url.startswith("//"): url = "https:" + url
            elif ":" in url: url = ""

        pos = str(it.get("position") or "top-right").strip().lower()
        if pos not in ALLOWED_POS: pos = "top-right"

        if "visible_in" in it:
            src = it.get("visible_in")
            if src is None: vis: List[str] = []
            elif isinstance(src, list): vis = [v for v in src if isinstance(v, str) and v in ALLOWED_VISIBLE]
            else: vis = ["countdown","clock"]
        else:
            vis = ["countdown","clock"]

        def _f(v: Any, d: float) -> float:
            try: return float(v)
            except Exception: return d

        try: z_index = int(it.get("z_index") or 10)
        except Exception: z_index = 10

        tint = it.get("tint") or {}
        out.append({
            "id": str(it.get("id") or f"logo-{idx}"),
            "type": "image",
            "url": url,
            "position": pos,
            "size_vmin": max(2.0, min(200.0, _f(it.get("size_vmin"), 12.0))),
            "opacity": max(0.0, min(1.0, _f(it.get("opacity"), 1.0))),
            "offset_vw": _f(it.get("offset_vw"), 2.0),
            "offset_vh": _f(it.get("offset_vh"), 2.0),
            "z_index": max(-9999, min(9999, z_index)),
            "visible_in": vis,
            "tint": {
                "color": str(tint.get("color") or "#000000"),
                "opacity": max(0.0, min(1.0, float(tint.get("opacity") or 0.0))),
                "blend": str(tint.get("blend") or "multiply").lower(),
            },
        })
    return out

def _merge_overlays_by_id(old_list: Any, new_list: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
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

# ── public API ────────────────────────────────────────────────────────────────
def load_config() -> Dict[str, Any]:
    path = str(CONFIG_PATH)
    if not os.path.exists(path):
        cfg = _coerce(get_defaults())
        _atomic_write(path, cfg)
        return cfg
    try:
        with open(path, "r", encoding="utf-8") as f:
            cfg = json.load(f)
    except Exception:
        cfg = {}
    cfg = _deep_merge(get_defaults(), cfg or {})
    cfg = _coerce(cfg)
    ok, _ = _validate(cfg)
    if not ok:
        cfg = _coerce(get_defaults())
    return _clean_by_mode(cfg)

def replace_config(new_cfg: Dict[str, Any]) -> Dict[str, Any]:
    cfg_in = _deep_merge(get_defaults(), new_cfg or {})
    if "overlays" in new_cfg:
        try: cfg_in["overlays"] = _sanitize_overlays(new_cfg.get("overlays"))
        except Exception: cfg_in["overlays"] = []
    cfg = _coerce(cfg_in)
    ok, msg = _validate(cfg)
    if not ok: raise ValueError(msg)
    cfg["_updated_at"] = int(time.time())
    cfg = _clean_by_mode(cfg)
    _atomic_write(str(CONFIG_PATH), cfg)
    return cfg

def save_config_patch(patch: Dict[str, Any]) -> Dict[str, Any]:
    current = load_config()
    merged = _deep_merge(get_defaults(), current)

    overlays_mode = "merge"
    if isinstance(patch, dict):
        overlays_mode = str(patch.get("overlays_mode") or "merge").lower()

    if isinstance(patch, dict) and "overlays" in patch:
        new_ov = _sanitize_overlays(patch.get("overlays"))
        if overlays_mode == "replace":
            merged["overlays"] = new_ov
        else:
            if new_ov:
                merged["overlays"] = _merge_overlays_by_id(merged.get("overlays"), new_ov)
        patch = dict(patch); patch.pop("overlays", None); patch.pop("overlays_mode", None)

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
        if daily_time: cfg["daily_time"] = daily_time
        cfg["duration_started_ms"] = 0; cfg["once_at"] = ""
    elif mode == "once":
        cfg["once_at"] = once_at or ""; cfg["duration_started_ms"] = 0
    elif mode == "duration":
        if duration_minutes: cfg["duration_minutes"] = int(duration_minutes)
    elif mode == "clock":
        if clock:
            base = get_defaults()["clock"]
            cfg["clock"] = _deep_merge(base, clock)
    else:
        raise ValueError("Ugyldig mode")
    return replace_config(cfg)

def start_duration(minutes: int) -> Dict[str, Any]:
    if minutes <= 0: raise ValueError("minutes må være > 0")
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
