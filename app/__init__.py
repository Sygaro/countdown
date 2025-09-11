# app/__init__.py
from __future__ import annotations
from flask import Flask

def create_app() -> Flask:
    app = Flask(__name__)

    # Blueprints
    from .routes.pages import bp as pages_bp
    from .routes.api import bp as api_bp

    app.register_blueprint(pages_bp)
    app.register_blueprint(api_bp)

    return app
