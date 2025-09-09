from __future__ import annotations
from flask import Flask
from .settings import STATIC_DIR
from .routes.public import bp as public_bp
from .routes.admin import bp as admin_bp

def create_app() -> Flask:
    app = Flask(
        __name__,
        static_folder=str(STATIC_DIR),
        static_url_path="/static",
    )
    app.register_blueprint(public_bp)
    app.register_blueprint(admin_bp, url_prefix="/api")

    @app.after_request
    def add_headers(resp):
        resp.headers.setdefault("X-Content-Type-Options", "nosniff")
        resp.headers.setdefault("X-Frame-Options", "SAMEORIGIN")
        return resp

    return app
