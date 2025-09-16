"""
Pytest-enhetstest av sanitize_overlays.
Kjør: pytest -q
"""

import pytest
from app.storage.overlays import sanitize_overlays


def test_sanitize_basic():
    seq = [
        {"id": "logo1", "url": "/static/img/test.png", "size_vmin": 50},
    ]
    out = sanitize_overlays(seq)
    assert isinstance(out, list)
    assert out and out[0]["id"] == "logo1"
    assert out[0]["size_vmin"] == 50
    assert out[0]["offset_x_vmin"] == 2
    assert out[0]["offset_y_vmin"] == 2


def test_sanitize_clamps_values():
    seq = [
        {"size_vmin": 9999, "opacity": -5},
    ]
    out = sanitize_overlays(seq)
    o = out[0]
    assert 2 <= o["size_vmin"] <= 200
    assert 0 <= o["opacity"] <= 1


def test_invalid_and_legacy_fields_are_removed():
    seq = [
        {
            "id": "legacy",
            "offset_vw": 123,  # skal ignoreres
            "offset_vh": 456,
            "visible_in": ["clock", "countdown", 42],  # ikke-str skal filtreres
        }
    ]
    out = sanitize_overlays(seq)
    o = out[0]
    assert "offset_vw" not in o
    assert "offset_vh" not in o
    assert o["offset_x_vmin"] == 2
    assert o["offset_y_vmin"] == 2
    assert all(isinstance(v, str) for v in o["visible_in"])
