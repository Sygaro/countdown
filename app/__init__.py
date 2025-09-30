# app/__init__.py
from __future__ import annotations
from flask import Flask, request, Response
def create_app() -> Flask:
    # Viktig: static ligger på prosjektroten (../static i forhold til app-pakken)
    app = Flask(
        __name__,
        static_folder="../static",
        static_url_path="/static",
    )
    # Registrer blueprints fra routes-pakken
    from .routes import pages_bp, api_bp
    app.register_blueprint(pages_bp)
    app.register_blueprint(api_bp)
    @app.after_request
    def apply_common_headers(resp: Response) -> Response:
        # Basale headere
        resp.headers.setdefault("X-Content-Type-Options", "nosniff")
        resp.headers.setdefault("Referrer-Policy", "no-referrer")
        # Dev vs prod-caching
        path = (request.path or "").lower()
        is_dynamic = path.startswith("/api/") or path in (
            "/diag",
            "/health",
            "/debug/selftest",
        )
        is_prod = not app.debug and not app.testing
        if path.startswith("/static/"):
            if is_prod:
                resp.headers["Cache-Control"] = "public, max-age=31536000, immutable"
            else:
                resp.headers["Cache-Control"] = "no-store"
        elif is_dynamic:
            resp.headers["Cache-Control"] = "no-store"
        return resp
    return app
