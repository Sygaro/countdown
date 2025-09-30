# path: wsgi.py
# file: wsgi.py
"""
wsgi.py
"""
from __future__ import annotations

from app import create_app

app = create_app()

if __name__ == "__main__":
    # Lokal dev: Flask dev-server eller waitress om installert.
    try:
        from waitress import serve  # type: ignore[reportMissingImports]
        serve(app, listen="0.0.0.0:5000")
    except Exception:
        app.run(host="0.0.0.0", port=5000, debug=True)
