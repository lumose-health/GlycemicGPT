"""Documentation-only response class for the Server-Sent Events routes (GLY-179).

The SSE endpoints (``src/routers/glucose_stream.py``, ``src/routers/alert_stream.py``)
build and return a ``StreamingResponse`` themselves, so FastAPI never constructs a
response object for them. ``SSEResponse`` exists purely so the *generated OpenAPI
document* files those routes' payload schemas under the content type they actually
serve: FastAPI reads ``response_class.media_type`` to decide where an additional
response's ``model`` lands, and without this the schema would be filed under
``application/json``.

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
