# app/sse.py
"""
Server-Sent Events (SSE) — publisering og strømming.
Brukes til å sende oppdateringer i sanntid fra backend til frontend.

Ansvar:
- Håndtere abonnerende klienter (via SSEQueue)
- Publisere hendelser (publish)
- Generere en SSE-strøm (sse_stream) for Flask
"""

from __future__ import annotations

import json
import queue
import threading
import time
from dataclasses import dataclass, field
from typing import Any, Dict, Iterable, Set

from flask import Response, stream_with_context

__all__ = ["publish", "sse_stream"]

# Intern global tilstand for SSE
_subscribers: Set["SSEQueue"] = set()
_sub_lock = threading.Lock()
_event_id = 0


@dataclass
class SSEQueue:
    """En enkel kø pr. abonnent. Holder på en begrenset FIFO."""

    q: "queue.Queue[dict[str, Any]]"
    created: float = field(default_factory=time.time)

    def put_nowait(self, item: dict[str, Any]) -> None:
        """Forsøk å sende et event til denne abonnenten. Dropper hvis full."""
        try:
            self.q.put_nowait(item)
        except queue.Full:
            # Hvis klienten ikke leser → fjern fra subscribers
            with _sub_lock:
                _subscribers.discard(self)
            # Tøm køen (unngå minnelekasje)
            try:
                while True:
                    self.q.get_nowait()
            except queue.Empty:
                pass
            # Her logger vi ikke til klient, den reconnecter selv


def _new_queue(maxsize: int = 100) -> SSEQueue:
    sq = SSEQueue(queue.Queue(maxsize=maxsize))
    with _sub_lock:
        _subscribers.add(sq)
    return sq


def _remove_queue(sq: SSEQueue) -> None:
    with _sub_lock:
        _subscribers.discard(sq)


def publish(event: dict[str, Any]) -> None:
    """
    Publiser en hendelse til alle abonnenter.
    Forventer et dict som minst har "type" (streng).

    Legger automatisk til:
      - id: auto-inkrement
      - ts: epoch (sek)
      - server_time_iso: nåværende ISO8601
    """
    global _event_id
    etype = str(event.get("type") or "message")
    payload = dict(event)
    payload.setdefault("ts", time.time())
    payload.setdefault("server_time_iso", time.strftime("%Y-%m-%dT%H:%M:%S%z"))

    with _sub_lock:
        _event_id += 1
        eid = _event_id
        targets = list(_subscribers)

    wire = {"id": eid, "type": etype, "data": payload}

    for sub in targets:
        sub.put_nowait(wire)


def _format_sse(wire: dict[str, Any]) -> str:
    """
    Gjør om internt event til SSE-linjer.
    Bruker 'event: <type>' og JSON i 'data:'.
    """
    eid = wire.get("id", 0)
    etype = wire.get("type", "message")
    data = wire.get("data", {})
    body = json.dumps(data, separators=(",", ":"), ensure_ascii=False)
    return f"id: {eid}\nevent: {etype}\ndata: {body}\n\n"


def sse_stream(ping_interval: float = 15.0) -> Response:
    """
    Flask-respons som holder en SSE-strøm åpen.
    - Setter retry: 15000 (15 sek) som standard
    - Sender periodiske 'ping'-events for å holde forbindelsen varm
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
                    # Ingen event innen timeout → send ping
                    last_ping = time.time()
                    yield _format_sse(
                        {"id": 0, "type": "ping", "data": {"ts": last_ping}}
                    )
        except (GeneratorExit, BrokenPipeError, ConnectionError):
            # Klienten koblet fra
            pass
        finally:
            _remove_queue(sq)

    return Response(
        gen(),
        mimetype="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",  # unbuffer i proxy (nginx etc)
            "Connection": "keep-alive",
        },
    )
