from __future__ import annotations
from functools import wraps
from typing import Callable
from flask import request, abort
from .storage import load_config

_DEF_HEADER = "X-Admin-Password"

def _extract_password() -> str | None:
    # 1) Custom header
    pwd = request.headers.get(_DEF_HEADER)
    if pwd:
        return pwd
    # 2) JSON body
    js = request.get_json(silent=True) or {}
    pwd = js.get("password") or js.get("admin_password")
    if pwd:
        return str(pwd)
    # 3) Basic auth
    if request.authorization and request.authorization.password:
        return request.authorization.password
    return None

def require_password(fn: Callable):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        cfg = load_config()
        expected = cfg.get("admin_password")
        if expected:
            provided = _extract_password()
            if not provided or provided != expected:
                abort(401, "Ugyldig eller manglende admin-passord")
        return fn(*args, **kwargs)
    return wrapper
