# app/storage/overlays.py
"""
Overlay-konfig: sanitering og normalisering.
- Kun støtte for vmin-baserte felter (size, offset_x, offset_y).
- Fjerner legacy-felter (vw/vh).
"""

from typing import Any, Dict, List


def sanitize_overlays(seq) -> List[Dict[str, Any]]:
    """Saniter overlay-konfig."""
    out: List[Dict[str, Any]] = []
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

    for idx, it in enumerate(seq, 1):
        if not isinstance(it, dict):
            continue
        if (it.get("type") or "image") != "image":
            continue

        tint = it.get("tint") or {}
        o = {
            "id": str(it.get("id") or f"logo-{idx}"),
            "type": "image",
            "url": str(it.get("url") or ""),
            "position": str(it.get("position") or "top-right"),
            "size_vmin": max(2.0, min(200.0, float(it.get("size_vmin") or 30))),
            "opacity": max(0.0, min(1.0, float(it.get("opacity") or 1))),
            "offset_x_vmin": float(it.get("offset_x_vmin") or 2),
            "offset_y_vmin": float(it.get("offset_y_vmin") or 2),
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
