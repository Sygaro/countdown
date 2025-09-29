# app/sse.py
"""
Server-Sent Events (SSE) med robust subscriber-kø og periodisk ping.
Hvorfor denne implementasjonen:
- Unngå backpressure: hver klient har sin egen bounded Queue; ved overflow droppes
  kun den klientens kø (klienten reconnecter).
- Tråd-sikkerhet: subscribers-set beskyttes av _sub_lock.
- Typestøy/Pylance: vi bruker stream_with_context på selve generator-objektet
  (ikke som dekorator på funksjonen) for å unngå "Expected 1 more positional argument".
"""
from __future__ import annotations
import json
import queue
import threading
import time
from dataclasses import dataclass, field
from typing import Dict, Iterator, Set
from flask import Response, stream_with_context
__all__ = ["publish", "sse_stream"]
# --- intern global tilstand ---------------------------------------------------
_subscribers: Set["SSEQueue"] = set()
_sub_lock = threading.Lock()
_event_id = 0
@dataclass
class SSEQueue:
    q: "queue.Queue[Dict]"
    created: float = field(default_factory=time.time)
    def put_nowait(self, item: Dict) -> None:
        try:
            self.q.put_nowait(item)
        except queue.Full:
            # Hvorfor: ikke blokker global strøm — drop og la klient reconnecte
            with _sub_lock:
                _subscribers.discard(self)
            try:
                while True:
                    self.q.get_nowait()
            except queue.Empty:
                pass
def _new_queue(maxsize: int = 100) -> "SSEQueue":
    sq = SSEQueue(queue.Queue(maxsize=maxsize))
    with _sub_lock:
        _subscribers.add(sq)
    return sq
def _remove_queue(sq: "SSEQueue") -> None:
    with _sub_lock:
        _subscribers.discard(sq)
# --- public API ---------------------------------------------------------------
def publish(event: Dict) -> None:
    """
    Publiser en hendelse til alle abonnenter.
    Forventer et dict med minst 'type' (streng).
    Legger til 'ts' (epoch sek) og auto-inkrementert 'id' på wire-formatet.
    """
    global _event_id
    etype = event.get("type") or "message"
    payload = dict(event)
    payload.setdefault("ts", time.time())
    with _sub_lock:
        _event_id += 1
        eid = _event_id
        targets = list(_subscribers)  # kopi for sikker iterasjon
    wire = {"id": eid, "type": etype, "data": payload}
    for sub in targets:
        sub.put_nowait(wire)
# --- helpers ------------------------------------------------------------------
def _format_sse(wire: Dict) -> str:
    """Konverter internt event til SSE-linjer (event + JSON-data)."""
    eid = wire.get("id", 0)
    etype = wire.get("type", "message")
    data = wire.get("data", {})
    body = json.dumps(data, separators=(",", ":"), ensure_ascii=False)
    return f"id: {eid}\nevent: {etype}\ndata: {body}\n\n"
# --- stream endpoint ----------------------------------------------------------
def sse_stream(ping_interval: float = 15.0) -> Response:
    """
    Flask-respons som holder en SSE-strøm åpen.
    Sender 'retry' først, så periodiske 'ping' for å holde forbindelsen varm.
    """
    def generate() -> Iterator[str]:
        sq = _new_queue()
        try:
            # Hint til klient om re-tilkoblingsintervall
            yield "retry: 15000\n\n"
            last_ping = time.time()
            while True:
                timeout = max(0.1, ping_interval - (time.time() - last_ping))
                try:
                    wire = sq.q.get(timeout=timeout)
                    yield _format_sse(wire)
                except queue.Empty:
                    last_ping = time.time()
                    yield _format_sse(
                        {"id": 0, "type": "ping", "data": {"ts": last_ping}}
                    )
        except (GeneratorExit, BrokenPipeError, ConnectionError):
            # Klient koblet fra
            pass
        finally:
            _remove_queue(sq)
    return Response(
        stream_with_context(generate()),
        mimetype="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",  # unbuffer ved evt. proxy
            "Connection": "keep-alive",
        },
    )
