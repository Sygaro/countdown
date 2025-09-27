# app/auth.py
from __future__ import annotations
import os
from functools import wraps
from flask import request, jsonify
from .storage import load_config

def require_password(fn):
    """
    Krever X-Admin-Password header KUN hvis det finnes et passord i config
    og COUNTDOWN_DISABLE_AUTH != '1'.
    """

    @wraps(fn)
    def wrapper(*args, **kwargs):
        if os.environ.get("COUNTDOWN_DISABLE_AUTH") == "1":
            return fn(*args, **kwargs)  # hvorfor: eksplisitt bypass i drift/feilsøking

        cfg = load_config()
        pw = str(cfg.get("admin_password") or "").strip()
        if pw == "":
            return fn(*args, **kwargs)  # hvorfor: tomt passord = ingen auth

        got = request.headers.get("X-Admin-Password", "")
        if got == pw:
            return fn(*args, **kwargs)
        return jsonify({"error": "Unauthorized"}), 401

    return wrapper
