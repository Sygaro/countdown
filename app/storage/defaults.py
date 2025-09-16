from __future__ import annotations
import json
from typing import Any, Dict

_DEFAULTS: Dict[str, Any] = {
    "mode": "daily",  # daily|once|duration|clock
    "daily_time": "19:15",
    "once_at": "",
    "duration_minutes": 20,
    "duration_started_ms": 0,
    "overlays": [],
    "clock": {
        "with_seconds": True,
        "color": "#e6edf3",
        "size_vmin": 15,
        "position": "center",  # center|top-left|top-right|bottom-left|bottom-right|top-center|bottom-center
        "messages_position": "right",  # right|left|above|below
        "messages_align": "center",  # start|center|end
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
        },
    },
    "admin_password": None,
}


def get_defaults() -> Dict[str, Any]:
    """Returner en dyp kopi av standardkonfigurasjonen."""
    return json.loads(json.dumps(_DEFAULTS))
