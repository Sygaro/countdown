# path: wsgi.py
# WSGI entrypoint for gunicorn/dev. App-factory brukes.

from __future__ import annotations
from app import create_app

app = create_app()

# Viktig: legg after_request her, etter at app finnes.
@app.after_request
def add_no_cache_headers(resp):
    # Hindrer at HTML/API/Tick caches → frontend henter nyeste v2 og config
    p = resp.request.path if hasattr(resp, "request") else None
    try:
        # Flask gir ikke resp.request som standard; bruk global request i stedet
        from flask import request as _rq
        p = _rq.path or ""
    except Exception:
        p = ""

    if p in ("/", "/admin", "/diag") or p.endswith(".html") or p.startswith("/api/") or p == "/tick":
        resp.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
        resp.headers["Pragma"] = "no-cache"
        resp.headers["Expires"] = "0"
    if resp.mimetype == "application/json":
        resp.headers.setdefault("Cache-Control", "no-cache, no-store, must-revalidate")
    return resp


if __name__ == "__main__":
    # Dev-kjøring (gunicorn bruker bare 'app' objektet)
    app.run(host="0.0.0.0", port=5000, debug=True)
