# wsgi.py

from __future__ import annotations
from app import create_app

app = create_app()

if __name__ == "__main__":
    from waitress import serve
    serve(app, host="0.0.0.0", port=5000)  # holder oss på 5000 for å matche kiosk
