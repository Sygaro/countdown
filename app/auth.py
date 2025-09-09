# app/auth.py
from __future__ import annotations
from functools import wraps

# Midlertidig: slå av all admin-autentisering.
def require_password(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        return fn(*args, **kwargs)
    return wrapper
