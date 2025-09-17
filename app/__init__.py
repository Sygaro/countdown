# app/__init__.py
"""
App factory for Countdown.
"""
from __future__ import annotations
from flask import Flask
from .settings import PROJECT_ROOT


def create_app() -> Flask:
    app = Flask(__name__, static_folder=str(PROJECT_ROOT / "static"))

    # Blueprints
    from .routes.pages import bp as pages_bp
    from .routes.admin import bp as admin_bp

    app.register_blueprint(pages_bp)
    app.register_blueprint(admin_bp, url_prefix="/api")

    @app.get("/healthz")
    def healthz():
        return {"ok": True}, 200

    return app
