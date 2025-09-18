# /home/reidar/countdown/app/sse.py
from __future__ import annotations

import json
import queue
import threading
import time
from dataclasses import dataclass, field
from typing import Dict, Iterable, Set

from flask import Response, stream_with_context

__all__ = ["publish", "sse_stream"]

# Intern global tilstand for SSE
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
            # Dropper gammel kø og lager ny for å ikke henge hele strømmen
            with _sub_lock:
                _subscribers.discard(self)
            # Ikke reiser videre — klienten vil typisk reconnecte
            try:
                while True:
                    self.q.get_nowait()
            except queue.Empty:
                pass


def _new_queue(maxsize: int = 100) -> SSEQueue:
    sq = SSEQueue(queue.Queue(maxsize=maxsize))
    with _sub_lock:
        _subscribers.add(sq)
    return sq


def _remove_queue(sq: SSEQueue) -> None:
    with _sub_lock:
        _subscribers.discard(sq)


def publish(event: Dict) -> None:
    """
    Publiser en hendelse til alle abonnenter.
    Forventer et dict som i minimum har 'type' (streng).
    Tillegger 'ts' (epoch sek) og auto-inkrementert 'id' på wiresiden.
    """
    global _event_id
    etype = event.get("type") or "message"
    payload = dict(event)
    payload.setdefault("ts", time.time())

    with _sub_lock:
        _event_id += 1
        eid = _event_id
        # Kopi for å iterere trygt
        targets = list(_subscribers)

    wire = {
        "id": eid,
        "type": etype,
        "data": payload,
    }

    for sub in targets:
        sub.put_nowait(wire)


def _format_sse(wire: Dict) -> str:
    """
    Gjør om internt event til SSE-linjer.
    Bruker 'event: <type>' og JSON i 'data:'.
    """
    eid = wire.get("id", 0)
    etype = wire.get("type", "message")
    data = wire.get("data", {})
    body = json.dumps(data, separators=(",", ":"), ensure_ascii=False)
    # NB: to blanke linjer avslutter en event-chunk
    return f"id: {eid}\nevent: {etype}\ndata: {body}\n\n"


def sse_stream(ping_interval: float = 15.0) -> Response:
    """
    Flask-respons som holder en SSE-strøm åpen.
    Sender 'retry' først, så periodiske 'ping' for å holde forbindelsen varm.
    """

    @stream_with_context
    def gen() -> Iterable[str]:
        sq = _new_queue()
        try:
            # Tving header-flush tidlig og sett klientens auto-retry
            yield "retry: 15000\n\n"

            last_ping = time.time()
            while True:
                timeout = max(0.1, ping_interval - (time.time() - last_ping))
                try:
                    wire = sq.q.get(timeout=timeout)
                    yield _format_sse(wire)
                except queue.Empty:
                    # Ping
                    last_ping = time.time()
                    yield _format_sse(
                        {"id": 0, "type": "ping", "data": {"ts": last_ping}}
                    )
        except (GeneratorExit, BrokenPipeError, ConnectionError):
            # Klienten dro — bare rydd
            pass
        finally:
            _remove_queue(sq)

    return Response(
        gen(),
        mimetype="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",  # unbuffer ved evt. proxy
            "Connection": "keep-alive",
        },
    )
