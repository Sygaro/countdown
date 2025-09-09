# app/routes/public.py
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
    return jsonify({"status": "ok"}), 200

@bp.get("/sse")
def sse():
    return sse_stream()

@bp.get("/state")
def state():
    cfg = load_config()
    state_obj = derive_state(cfg)
    return jsonify(state_obj), 200
