# app/__init__.py
from __future__ import annotations
import flask
from .settings import PROJECT_ROOT
def create_app() -> flask.Flask:
    # Hvorfor: eksplisitt og stabil static-path.
    app = flask.Flask(
        __name__,
        static_folder=str((PROJECT_ROOT / "static").resolve()),
        static_url_path="/static",
    )
    # JSON-innstillinger via config for å unngå Pylance/type issues:
    # - Ikke sortér JSON-nøkler (bevar naturlig rekkefølge).
    # - Ikke prettyprint (ytelse/overføringsstørrelse).
    app.config["JSON_SORT_KEYS"] = False
    app.config["JSONIFY_PRETTYPRINT_REGULAR"] = False
    # Blueprints i aktiv bruk
    from .routes.pages import bp as pages_bp
    from .routes.api import bp as api_bp
    app.register_blueprint(pages_bp)
    app.register_blueprint(api_bp)
    # Merk: admin.py/public.py er fjernet etter avklaring.
    return app
