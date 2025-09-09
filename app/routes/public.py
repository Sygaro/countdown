from __future__ import annotations
from flask import Blueprint, send_from_directory, jsonify
from ..settings import STATIC_DIR
from ..sse import sse_stream
from ..storage import load_config
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
