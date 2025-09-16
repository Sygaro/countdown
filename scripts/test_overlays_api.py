#!/usr/bin/env python3
"""
Engangs sanity-check av overlay-API mot kjørende backend.

Krav:
- Flask/gunicorn-server kjører lokalt på http://localhost:5000
- Kall: python scripts/test_overlays_api.py
"""

import requests
import json

BASE = "http://localhost:5000/api/config"


def pretty(d):
    return json.dumps(d, indent=2, ensure_ascii=False)


def main():
    # Payload med legacy-felter som egentlig skal ignoreres
    payload = {
        "overlays": [
            {
                "id": "legacy-test",
                "url": "/static/img/logo.svg",
                "size_vmin": 25,
                "offset_vw": 10,  # legacy
                "offset_vh": 5,   # legacy
                "tint": {"color": "#ff0000", "opacity": 0.5},
            }
        ]
    }

    print("Sender patch med legacy-felter...")
    r = requests.post(BASE, json=payload)
    r.raise_for_status()
    print("Response:", r.status_code)

    data = r.json()
    print("=== Resultat fra backend ===")
    print(pretty(data["config"]["overlays"]))


if __name__ == "__main__":
    main()
