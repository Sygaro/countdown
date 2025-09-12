# app/routes/pages.py
from __future__ import annotations
from flask import Blueprint, current_app, make_response, jsonify
from .api import _compute_tick, _read_config  # gjenbruk beregningen


bp_pages = Blueprint("pages", __name__)  # én blueprint

def _no_cache(resp):
    resp.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    resp.headers["Pragma"] = "no-cache"
    resp.headers["Expires"] = "0"
    return resp

def _send_first(*candidates: str):
    """Prøver flere statiske kandidater – viktig hvis filnavn varierer mellom brancher."""
    for name in candidates:
        try:
            return make_response(current_app.send_static_file(name))
        except Exception:
            continue
    return make_response(("Missing static page", 404))

@bp_pages.get("/")
def home():
    # Vis “visning” – prøv index.html først
    return _no_cache(_send_first("index.html", "view.html", "visning.html", "display.html"))

@bp_pages.get("/view")
def view_alias():
    # Nyttig alias
    return _no_cache(_send_first("index.html", "view.html", "visning.html", "display.html"))

@bp_pages.get("/admin")
def admin_timer():
    return _no_cache(make_response(current_app.send_static_file("admin-timer.html")))

@bp_pages.get("/admin/style")
def admin_style():
    return _no_cache(make_response(current_app.send_static_file("admin-style.html")))

@bp_pages.get("/diag")
def diag():
    return _no_cache(make_response(current_app.send_static_file("diag.html")))

@bp_pages.get("/about")
def about():
    try:
        return _no_cache(make_response(current_app.send_static_file("about.html")))
    except Exception:
        return _no_cache(make_response(current_app.send_static_file("index.html")))

@bp_pages.get("/debug/routes")
def list_routes():
    rules = []
    for r in current_app.url_map.iter_rules():
        rules.append({"endpoint": r.endpoint,
                      "methods": sorted(m for m in r.methods if m not in {"HEAD", "OPTIONS"}),
                      "rule": str(r)})
    rules.sort(key=lambda x: x["rule"])
    return jsonify({"routes": rules})

@bp_pages.get("/tick")
def root_tick_alias():
    cfg = _read_config()
    return current_app.response_class(
        response=json.dumps(_compute_tick(cfg)),
        status=200,
        mimetype="application/json",
    )