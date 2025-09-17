# app/auth.py
"""
Autentisering for admin-endepunkter.
- Krever `X-Admin-Password` header hvis passord er satt i config.json
- Kan overstyres med miljøvariabel: COUNTDOWN_DISABLE_AUTH=1
"""

from __future__ import annotations
import os
from functools import wraps
from flask import request, jsonify
from app.storage.api import get_config


def require_password(fn):
    """
    Flask-dekoratør som beskytter ruter med admin-passord.
    - Hopper over auth hvis COUNTDOWN_DISABLE_AUTH=1
    - Hopper over auth hvis config har tomt passord
    """

    @wraps(fn)
    def wrapper(*args, **kwargs):
        # 1. Bypass via miljøvariabel (for drift/feilsøking)
        if os.environ.get("COUNTDOWN_DISABLE_AUTH") == "1":
            return fn(*args, **kwargs)

        # 2. Les passord fra config
        cfg = get_config()
        pw = str(cfg.get("admin_password") or "").strip()

        # 3. Ingen passord = ingen auth
        if pw == "":
            return fn(*args, **kwargs)

        # 4. Sammenlign header
        got = request.headers.get("X-Admin-Password", "")
        if got == pw:
            return fn(*args, **kwargs)

        # 5. Avvist
        return jsonify({"ok": False, "error": "Unauthorized"}), 401

    return wrapper
