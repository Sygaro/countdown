# wsgi.py
"""
WSGI entrypoint for Countdown app.
Brukes både i utvikling og produksjon.
Starter Waitress-server på host/port (default: 0.0.0.0:5000).
"""

from __future__ import annotations
import os
from app import create_app

# Flask-app (brukes av f.eks. gunicorn, waitress, etc.)
app = create_app()

if __name__ == "__main__":
    from waitress import serve

    host = os.environ.get("COUNTDOWN_HOST", "0.0.0.0")
    port = int(os.environ.get("COUNTDOWN_PORT", "5000"))

    print(f"Starting Countdown server on {host}:{port} ...")
    serve(app, host=host, port=port)
