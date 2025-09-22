# app/__init__.py
from __future__ import annotations
import flask
from .settings import PROJECT_ROOT


def create_app() -> flask.Flask:
    app = flask.Flask(
        __name__,
        static_folder=str((PROJECT_ROOT / "static").resolve()),
        static_url_path="/static",
    )
    from .routes.pages import bp as pages_bp
    from .routes.api import bp as api_bp

    app.register_blueprint(pages_bp)
    app.register_blueprint(api_bp)
    return app
