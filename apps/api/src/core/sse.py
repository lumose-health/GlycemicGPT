"""Shared Server-Sent Events plumbing for the streaming routers.

Home for the pieces both SSE routers (``src/routers/glucose_stream.py``,
``src/routers/alert_stream.py``) need: the wire formatter, the keep-alive payload
builder, and a documentation-only response class.

``SSEResponse`` exists purely so the *generated OpenAPI document* files those
routes' payload schemas under the content type they actually serve: FastAPI reads
``response_class.media_type`` to decide where an additional response's ``model``
lands, and without this the schema would be filed under ``application/json``. The
handlers build and return a ``StreamingResponse`` themselves, so FastAPI never
constructs a response object for them and the transport is untouched.

Why it subclasses ``JSONResponse`` and not ``StreamingResponse``: in
``fastapi.openapi.utils.get_openapi_path`` the 200 response schema is seeded with
``{"type": "string"}`` for any response class that is *not* a ``JSONResponse``
subclass, and the declared payload model is then deep-merged on top -- yielding a
self-contradictory ``{"type": "string", "$ref": ...}``. A ``JSONResponse`` subclass
seeds an empty schema instead, so the payload model lands cleanly. That behaviour is
pinned by ``tests/test_exported_contract.py``, so a FastAPI upgrade that changes it
fails the contract gate rather than silently corrupting the published schema.
"""

from __future__ import annotations

import json
from datetime import UTC, datetime
from typing import Any, NoReturn

from fastapi.responses import JSONResponse


class SSEResponse(JSONResponse):
    """Marks a route as serving ``text/event-stream`` for OpenAPI purposes only.

    Never instantiated: the SSE handlers return their own ``StreamingResponse``, so
    FastAPI's response-class path is not exercised. ``render`` raises to keep it that
    way -- if a handler is ever changed to return a plain value, this fails loudly
    instead of quietly serving a JSON body under an ``text/event-stream`` header.
    """

    media_type = "text/event-stream"

    def render(self, content: Any) -> NoReturn:
        raise NotImplementedError(
            "SSEResponse is a documentation-only marker for OpenAPI generation. "
            "SSE endpoints must return a StreamingResponse (or another explicit "
            "Response) rather than a value for FastAPI to serialize."
        )


def format_sse_event(event_type: str, data: dict, event_id: str | None = None) -> str:
    """Format data as an SSE event.

    Args:
        event_type: The event type (e.g., 'glucose', 'heartbeat')
        data: Dictionary to serialize as JSON data
        event_id: Optional event ID for client tracking

    Returns:
        Formatted SSE event string
    """
    lines = []
    if event_id:
        lines.append(f"id: {event_id}")
    lines.append(f"event: {event_type}")
    lines.append(f"data: {json.dumps(data)}")
    lines.append("")  # Empty line to end the event
    return "\n".join(lines) + "\n"


def build_heartbeat_payload() -> dict:
    """Build the JSON body of a `heartbeat` keep-alive, shared by both streams.

    Its contract is `SseHeartbeatPayload` in `src/schemas/stream_events.py`.
    """
    return {"event": "heartbeat", "timestamp": datetime.now(UTC).isoformat()}
