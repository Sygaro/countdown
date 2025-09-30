# app/routes/__init__.py
from __future__ import annotations
# Re-eksporter blueprint-objektene. Ingen @app-dekoratorer her.
from .pages import bp as pages_bp  # type: ignore[reportMissingImports]
from .api import bp as api_bp  # type: ignore[reportMissingImports]
__all__ = ["pages_bp", "api_bp"]
