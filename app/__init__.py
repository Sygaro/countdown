# app/__init__.py
from __future__ import annotations
from flask import Flask
from .settings import PROJECT_ROOT

def create_app() -> Flask:
    app = Flask(
        __name__,
        static_folder=str((PROJECT_ROOT / "static").resolve()),
        static_url_path="/static",
    )

    # Blueprints
    from .routes.pages import bp_pages
    from .routes.api import bp as api_bp

    app.register_blueprint(bp_pages)   # registreres én gang
    app.register_blueprint(api_bp)

    return app
