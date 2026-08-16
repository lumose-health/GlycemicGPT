"""Named payload schemas for the Server-Sent Events streams (GLY-179).

These describe the JSON object carried in the ``data:`` line of each event emitted by
``src/routers/glucose_stream.py`` (``GET /api/v1/glucose/stream``) and
``src/routers/alert_stream.py`` (``GET /api/v1/alerts/stream``). Their job is to give
generated clients named types for the stream payloads instead of an untyped blob;
transport handling (reconnect, ``Last-Event-ID``, buffering) stays platform-specific
and is deliberately not modelled here.

Contract-only: the routers serialize plain dicts through ``format_sse_event``, so
nothing in this module runs on the request path. ``tests/test_exported_contract.py``
validates the routers' actual emitted payloads against these models, so a payload that
drifts from its schema fails CI rather than silently publishing a lie.

The SSE event name (``glucose``, ``alert``, ``heartbeat``, ``no_data``, ``error``)
travels on the event's ``event:`` line, *not* inside the JSON body, so these models
carry no discriminator field -- a client selects the model from the event name it
received. That is also why the two streams' ``alert`` events get separate models: they
are genuinely different shapes (the glucose stream emits the raw alert row, the alert
stream emits ``alert_to_dict``'s client-facing projection).
"""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, RootModel


class SseIobPayload(BaseModel):
    """Insulin-on-board snapshot embedded in a `glucose` event."""

    current: float
    is_stale: bool


class SseGlucosePayload(BaseModel):
    """`glucose` event on `GET /api/v1/glucose/stream`."""

    # Canonical mg/dL, as stored. Clients render using the user's glucose_unit
    # preference; the stream never converts.
    value: int
    trend: str
    trend_rate: float | None
    reading_timestamp: datetime
    minutes_ago: int
    is_stale: bool
    iob: SseIobPayload | None
    timestamp: datetime


class SseGlucoseAlertPayload(BaseModel):
    """`alert` event on `GET /api/v1/glucose/stream`."""

    id: str
    alert_type: str
    severity: str
    current_value: float
    predicted_value: float | None
    prediction_minutes: int | None
    iob_value: float | None
    message: str
    trend_rate: float | None
    source: str
    created_at: datetime
    expires_at: datetime


class SseAlertPayload(BaseModel):
    """`alert` event on `GET /api/v1/alerts/stream`."""

    id: str
    alert_type: str
    severity: str
    current_value: float
    predicted_value: float | None
    iob_value: float | None
    message: str
    trend_rate: float | None
    timestamp: datetime
    acknowledged: bool
    # Present only on a caregiver's stream, which fans in several patients'
    # alerts; absent entirely for a diabetic user streaming their own.
    patient_name: str | None = None


class SseNoDataPayload(BaseModel):
    """`no_data` event: the user has no glucose readings to report yet."""

    message: str
    timestamp: datetime


class SseErrorPayload(BaseModel):
    """`error` event: the server failed to fetch data for this tick.

    Advisory only -- the stream stays open and retries on the next interval.
    """

    message: str
    timestamp: datetime


class SseHeartbeatPayload(BaseModel):
    """`heartbeat` event: keep-alive, carries no data of its own."""

    timestamp: datetime


class GlucoseStreamEvent(
    RootModel[
        SseGlucosePayload
        | SseGlucoseAlertPayload
        | SseNoDataPayload
        | SseErrorPayload
        | SseHeartbeatPayload
    ]
):
    """Any payload emitted by `GET /api/v1/glucose/stream`.

    Select the member by the SSE `event:` name: `glucose`, `alert`,
    `no_data`, `error`, `heartbeat`.
    """


class AlertStreamEvent(RootModel[SseAlertPayload | SseHeartbeatPayload]):
    """Any payload emitted by `GET /api/v1/alerts/stream`.

    Select the member by the SSE `event:` name: `alert`, `heartbeat`.
    """
