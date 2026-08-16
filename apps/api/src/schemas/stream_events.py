"""Named payload schemas for the Server-Sent Events streams.

These describe the JSON object carried in the ``data:`` line of each event emitted by
``src/routers/glucose_stream.py`` (``GET /api/v1/glucose/stream``) and
``src/routers/alert_stream.py`` (``GET /api/v1/alerts/stream``). Their job is to give
generated clients named types for the stream payloads instead of an untyped blob;
transport handling (reconnect, ``Last-Event-ID``, buffering) stays platform-specific
and is deliberately not modelled here.

The routers build their payloads through small named builders and serialize plain
dicts through ``format_sse_event``, so these models are (with one exception) not on
the request path. ``tests/test_exported_contract.py`` validates each builder's actual
output against its model, so a payload that drifts from its schema fails CI rather
than silently publishing a lie. The exception is ``SseIobPayload``, which the glucose
router constructs directly -- the nested IoB object is the one place where building
the model is simpler than duplicating its shape.

Every payload carries an ``event`` discriminator whose value repeats the SSE
``event:`` name. Without it the union is undecidable: ``no_data`` and ``error`` are
structurally identical and ``heartbeat`` is a structural supertype of everything, so
a generated client -- the point of publishing these at all -- could not mechanically
tell a keep-alive from a glucose reading. The ``event:`` line stays authoritative for
hand-written clients; the field is the machine-readable copy of it.
"""

from __future__ import annotations

from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, Field, RootModel

from src.models.glucose import TrendDirection
from src.schemas.glucose import CANONICAL_MGDL_NOTE

# The glucose router falls back to this string when a reading carries no trend, so
# the published type is the enum *plus* this literal rather than a bare `str`.
# Imported by the router so the emitted value and the published one stay one thing;
# the `Literal["Unknown"]` below has to spell it out again (PEP 586 takes literals
# only), and `test_glucose_payload_without_trend` pins the two together.
UNKNOWN_TREND = "Unknown"


class SseIobPayload(BaseModel):
    """Insulin-on-board snapshot embedded in a `glucose` event."""

    current: float = Field(
        ..., description="Projected insulin on board, in units, at send time."
    )
    is_stale: bool = Field(
        ...,
        description=(
            "True when the projection is based on a pump confirmation more than "
            "2 hours old."
        ),
    )


class SseGlucosePayload(BaseModel):
    """`glucose` event on `GET /api/v1/glucose/stream`."""

    event: Literal["glucose"] = Field(
        ..., description="Discriminator; matches the SSE `event:` name."
    )
    value: int = Field(
        ...,
        description=f"Glucose value in mg/dL. {CANONICAL_MGDL_NOTE}",
        ge=20,
        le=600,
    )
    trend: TrendDirection | Literal["Unknown"] = Field(
        ...,
        description=(
            "Trend direction from the CGM, or `Unknown` when the reading carries "
            "no trend."
        ),
    )
    trend_rate: float | None = Field(
        ..., description="Rate of change in mg/dL/min, or null when unavailable."
    )
    reading_timestamp: datetime = Field(
        ..., description="When the reading was taken by the sensor."
    )
    minutes_ago: int = Field(
        ..., description="Whole minutes between the reading and this event."
    )
    is_stale: bool = Field(
        ..., description="True if the reading is more than 10 minutes old."
    )
    iob: SseIobPayload | None = Field(
        ..., description="Insulin-on-board snapshot, or null when no projection exists."
    )
    timestamp: datetime = Field(..., description="When this event was emitted.")


class SseGlucoseAlertPayload(BaseModel):
    """`alert` event on `GET /api/v1/glucose/stream`."""

    event: Literal["alert"] = Field(
        ..., description="Discriminator; matches the SSE `event:` name."
    )
    id: str = Field(..., description="Alert UUID.")
    alert_type: str = Field(
        ..., description="Alert category, e.g. `low_urgent`, `high_predicted`."
    )
    severity: str = Field(
        ..., description="Severity: `info`, `warning`, `urgent` or `emergency`."
    )
    current_value: float = Field(
        ...,
        description=f"Glucose value that triggered the alert, in mg/dL. "
        f"{CANONICAL_MGDL_NOTE}",
    )
    predicted_value: float | None = Field(
        ...,
        description=(
            f"Predicted glucose in mg/dL for a predictive alert, else null. "
            f"{CANONICAL_MGDL_NOTE}"
        ),
    )
    prediction_minutes: int | None = Field(
        ..., description="Minutes ahead the prediction refers to, else null."
    )
    iob_value: float | None = Field(
        ..., description="Insulin on board in units at alert time, else null."
    )
    message: str = Field(..., description="Human-readable alert text.")
    trend_rate: float | None = Field(
        ..., description="Rate of change in mg/dL/min at alert time, else null."
    )
    source: str = Field(
        ..., description="What raised the alert, e.g. `predictive`, `threshold`."
    )
    created_at: datetime = Field(..., description="When the alert was raised.")
    expires_at: datetime = Field(..., description="When the alert stops being active.")


class SseAlertPayload(BaseModel):
    """`alert` event on `GET /api/v1/alerts/stream`."""

    event: Literal["alert"] = Field(
        ..., description="Discriminator; matches the SSE `event:` name."
    )
    id: str = Field(..., description="Alert UUID.")
    alert_type: str = Field(
        ..., description="Alert category, e.g. `low_urgent`, `high_predicted`."
    )
    severity: str = Field(
        ..., description="Severity: `info`, `warning`, `urgent` or `emergency`."
    )
    current_value: float = Field(
        ...,
        description=f"Glucose value that triggered the alert, in mg/dL. "
        f"{CANONICAL_MGDL_NOTE}",
    )
    predicted_value: float | None = Field(
        ...,
        description=(
            f"Predicted glucose in mg/dL for a predictive alert, else null. "
            f"{CANONICAL_MGDL_NOTE}"
        ),
    )
    iob_value: float | None = Field(
        ..., description="Insulin on board in units at alert time, else null."
    )
    message: str = Field(..., description="Human-readable alert text.")
    trend_rate: float | None = Field(
        ..., description="Rate of change in mg/dL/min at alert time, else null."
    )
    timestamp: datetime = Field(..., description="When the alert was raised.")
    acknowledged: bool = Field(
        ..., description="True once the user has acknowledged the alert."
    )
    patient_name: str | None = Field(
        None,
        description=(
            "Identifies which patient the alert belongs to. Present only on a "
            "caregiver's stream, which fans in several patients' alerts; absent "
            "entirely for a diabetic user streaming their own."
        ),
    )


class SseNoDataPayload(BaseModel):
    """`no_data` event: the user has no glucose readings to report yet."""

    event: Literal["no_data"] = Field(
        ..., description="Discriminator; matches the SSE `event:` name."
    )
    message: str = Field(..., description="Human-readable explanation.")
    timestamp: datetime = Field(..., description="When this event was emitted.")


class SseErrorPayload(BaseModel):
    """`error` event: the server failed to fetch data for this tick.

    Advisory only -- the stream stays open and retries on the next interval.
    """

    event: Literal["error"] = Field(
        ..., description="Discriminator; matches the SSE `event:` name."
    )
    message: str = Field(..., description="Human-readable explanation.")
    timestamp: datetime = Field(..., description="When this event was emitted.")


class SseHeartbeatPayload(BaseModel):
    """`heartbeat` event: keep-alive, carries no data of its own."""

    event: Literal["heartbeat"] = Field(
        ..., description="Discriminator; matches the SSE `event:` name."
    )
    timestamp: datetime = Field(..., description="When this event was emitted.")


GlucoseStreamPayload = Annotated[
    SseGlucosePayload
    | SseGlucoseAlertPayload
    | SseNoDataPayload
    | SseErrorPayload
    | SseHeartbeatPayload,
    Field(discriminator="event"),
]

AlertStreamPayload = Annotated[
    SseAlertPayload | SseHeartbeatPayload,
    Field(discriminator="event"),
]


class GlucoseStreamEvent(RootModel[GlucoseStreamPayload]):
    """Any payload emitted by `GET /api/v1/glucose/stream`.

    Select the member by the `event` field, which repeats the SSE `event:` name:
    `glucose`, `alert`, `no_data`, `error`, `heartbeat`.
    """


class AlertStreamEvent(RootModel[AlertStreamPayload]):
    """Any payload emitted by `GET /api/v1/alerts/stream`.

    Select the member by the `event` field, which repeats the SSE `event:` name:
    `alert`, `heartbeat`.
    """
