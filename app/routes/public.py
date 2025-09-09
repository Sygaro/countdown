from __future__ import annotations
from flask import Blueprint, send_from_directory, jsonify
from ..settings import STATIC_DIR
from ..sse import sse_stream
from ..storage import load_config, save_config
from ..countdown import derive_state

bp = Blueprint("public", __name__)

@bp.get("/")
def index():
    return send_from_directory(STATIC_DIR, "index.html")

@bp.get("/health")
def health():
    return {"ok": True}

@bp.get("/sse")
def sse():
    return sse_stream()

@bp.get("/state")
def state_snapshot():
    cfg = load_config()
    data = derive_state(cfg)
    return jsonify(data)

@app.get("/api/config")
def api_get_config():
    return jsonify(load_config()), 200

@app.post("/api/config")
def api_post_config():
    payload = request.get_json(force=True, silent=False) or {}
    if not isinstance(payload, dict):
        return jsonify({"error": "Payload must be a JSON object"}), 400
    return jsonify(save_config(payload)), 200