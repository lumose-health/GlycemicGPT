"""Gates for the exported OpenAPI contract, `contracts/openapi.json`.

This is the artifact client generators build from, so three things have to hold and
keep holding:

1. It is the document the app serves -- generating clients from a stale or decorated
   spec is exactly the silent drift this work exists to stop.
2. It agrees with `apps/api/contract/openapi.json`, the version-stamped pin the
   Android repo consumes, modulo the stamp. Two committed copies of one document
   are only safe if their relationship is enforced.
3. The SSE streams publish named, *mechanically discriminable* payload schemas, and
   those schemas describe what the routers actually emit.

If any of these fails: run `./scripts/regen-contracts.sh` from the repo root and
commit the result (bumping `apps/api/contract/CONTRACT_VERSION` first if the surface
changed).
"""

from __future__ import annotations

import json
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from pydantic import ValidationError

from src.core.sse import build_heartbeat_payload
from src.models.alert import Alert, AlertSeverity, AlertType
from src.models.glucose import GlucoseReading, TrendDirection
from src.openapi_contract import (
    EXPORTED_DISPLAY_PATH,
    exported_of,
    generate_exported_spec,
    generate_spec,
    load_exported,
    load_versioned,
    serialize_spec,
)
from src.routers.alert_stream import build_alert_stream_payload
from src.routers.glucose_stream import (
    build_error_payload,
    build_glucose_alert_payload,
    build_glucose_payload,
    build_iob_payload,
    build_no_data_payload,
)
from src.schemas.stream_events import (
    UNKNOWN_TREND,
    AlertStreamEvent,
    GlucoseStreamEvent,
    SseAlertPayload,
    SseErrorPayload,
    SseGlucoseAlertPayload,
    SseGlucosePayload,
    SseHeartbeatPayload,
    SseIobPayload,
    SseNoDataPayload,
)
from src.services.iob_projection import IoBProjection

STALE_MESSAGE = (
    f"{EXPORTED_DISPLAY_PATH} is stale. Regenerate with ./scripts/regen-contracts.sh"
)


@pytest.fixture
def alert() -> Alert:
    """An in-memory Alert row (no session) with every optional field populated."""
    now = datetime.now(UTC)
    return Alert(
        id=uuid.uuid4(),
        user_id=uuid.uuid4(),
        alert_type=AlertType.LOW_URGENT,
        severity=AlertSeverity.URGENT,
        current_value=68.0,
        predicted_value=55.0,
        prediction_minutes=20,
        iob_value=1.4,
        message="Predicted low in 20 minutes",
        trend_rate=-1.8,
        source="predictive",
        acknowledged=False,
        created_at=now,
        expires_at=now + timedelta(minutes=30),
    )


@pytest.fixture
def reading() -> GlucoseReading:
    """An in-memory GlucoseReading row (no session)."""
    return GlucoseReading(
        id=uuid.uuid4(),
        user_id=uuid.uuid4(),
        value=112,
        reading_timestamp=datetime.now(UTC),
        trend=TrendDirection.FLAT,
        trend_rate=0.2,
        received_at=datetime.now(UTC),
        source="dexcom",
    )


@pytest.fixture
def projection() -> IoBProjection:
    """An in-memory IoB projection, as `get_iob_projection` returns it."""
    now = datetime.now(UTC)
    return IoBProjection(
        confirmed_iob=1.6,
        confirmed_at=now - timedelta(minutes=12),
        projected_iob=1.25,
        projected_at=now,
        projected_30min=0.9,
        projected_60min=0.5,
        minutes_since_confirmed=12,
        is_stale=False,
    )


# --------------------------------------------------------------------------
# 1. The exported artifact is the served document, and it is deterministic
# --------------------------------------------------------------------------


def test_exported_contract_matches_live_schema() -> None:
    """The committed export must be byte-identical to the freshly generated spec."""
    assert serialize_spec(generate_exported_spec()) == load_exported(), STALE_MESSAGE


def test_export_is_byte_identical_across_runs() -> None:
    """Two exports of the same app produce identical bytes (AC1).

    Key ordering is the one source of nondeterminism in FastAPI's schema assembly,
    so this would catch a serializer regression that dropped `sort_keys`.
    """
    assert serialize_spec(generate_exported_spec()) == serialize_spec(
        generate_exported_spec()
    )


async def test_exported_contract_is_what_the_app_serves(client) -> None:
    """The committed export equals the document served from `/openapi.json`.

    The security suite fuzzes the *served* document -- it fetches `/openapi.json`
    from a running app and never reads the committed file -- while clients are
    generated from the committed one. This is the assertion that keeps those two
    the same API; checking `app.openapi()` alone would not catch the endpoint
    diverging.
    """
    response = await client.get("/openapi.json")
    assert response.status_code == 200
    assert response.json() == json.loads(load_exported()), STALE_MESSAGE


def test_exported_contract_carries_no_build_time_decoration() -> None:
    """The export is the served document -- no contract-version stamp, no extras.

    If the exported file grew decoration, the surface the security suite fuzzes and
    the one generated clients are built from would describe two different APIs.
    """
    exported = json.loads(load_exported())
    assert "x-contract-version" not in exported["info"]


def test_exported_and_versioned_artifacts_agree() -> None:
    """The two committed copies are one document modulo the version stamp.

    `apps/api/contract/openapi.json` is pinned by path from the Android repo, so it
    cannot move yet; this keeps the duplicate honest until it is consolidated.
    """
    assert json.loads(load_exported()) == exported_of(json.loads(load_versioned()))
    # Guard against the invariant being trivially satisfied by a stampless pin.
    assert "x-contract-version" in json.loads(load_versioned())["info"]


def test_exported_spec_equals_stripped_versioned_spec() -> None:
    """The same relationship holds for freshly generated specs, not just the files."""
    assert generate_exported_spec() == exported_of(generate_spec())


# --------------------------------------------------------------------------
# 2. The SSE streams publish named, discriminable payload schemas
# --------------------------------------------------------------------------

SSE_ROUTES = {
    "/api/v1/glucose/stream": "GlucoseStreamEvent",
    "/api/v1/alerts/stream": "AlertStreamEvent",
}


def _sse_200_schema(spec: dict[str, Any], path: str) -> dict[str, Any]:
    content = spec["paths"][path]["get"]["responses"]["200"]["content"]
    assert set(content) == {"text/event-stream"}, (
        f"{path} must advertise only text/event-stream, got {sorted(content)}"
    )
    return content["text/event-stream"]["schema"]


@pytest.mark.parametrize(("path", "model_name"), sorted(SSE_ROUTES.items()))
def test_sse_route_publishes_named_event_schema(path: str, model_name: str) -> None:
    """Each stream's 200 body is a `$ref` to its named union (AC2)."""
    spec = json.loads(load_exported())
    schema = _sse_200_schema(spec, path)
    assert schema == {"$ref": f"#/components/schemas/{model_name}"}, (
        f"{path} lost its named SSE payload schema. If this appeared after a "
        "FastAPI upgrade, re-check the JSONResponse subclassing note in "
        "src/core/sse.py -- a non-JSONResponse response class seeds the 200 "
        "schema with {'type': 'string'} and corrupts the published contract."
    )


def test_sse_payload_models_are_all_published() -> None:
    """Every payload model reachable from the two unions is a named component."""
    schemas = json.loads(load_exported())["components"]["schemas"]
    expected = {
        "AlertStreamEvent",
        "GlucoseStreamEvent",
        "SseAlertPayload",
        "SseErrorPayload",
        "SseGlucoseAlertPayload",
        "SseGlucosePayload",
        "SseHeartbeatPayload",
        "SseIobPayload",
        "SseNoDataPayload",
    }
    assert expected <= set(schemas)

    for union in ("GlucoseStreamEvent", "AlertStreamEvent"):
        members = {m["$ref"].rsplit("/", 1)[-1] for m in schemas[union]["oneOf"]}
        assert members <= set(schemas), f"{union} references an unpublished schema"


@pytest.mark.parametrize(
    ("union", "expected_mapping"),
    [
        (
            "GlucoseStreamEvent",
            {
                "glucose": "SseGlucosePayload",
                "alert": "SseGlucoseAlertPayload",
                "no_data": "SseNoDataPayload",
                "error": "SseErrorPayload",
                "heartbeat": "SseHeartbeatPayload",
            },
        ),
        (
            "AlertStreamEvent",
            {"alert": "SseAlertPayload", "heartbeat": "SseHeartbeatPayload"},
        ),
    ],
)
def test_sse_unions_publish_a_discriminator(
    union: str, expected_mapping: dict[str, str]
) -> None:
    """Each union carries an OpenAPI discriminator keyed on `event`.

    Without it the unions are undecidable by construction: `no_data` and `error`
    are structurally identical and `heartbeat` is a structural supertype of every
    other member, so a generated client could not tell a keep-alive from a glucose
    reading. The discriminator is what makes these schemas usable by the code
    generators this contract exists to feed.
    """
    schema = json.loads(load_exported())["components"]["schemas"][union]
    discriminator = schema["discriminator"]
    assert discriminator["propertyName"] == "event"
    assert discriminator["mapping"] == {
        name: f"#/components/schemas/{model}"
        for name, model in expected_mapping.items()
    }


def test_sse_unions_resolve_ambiguous_payloads_by_discriminator() -> None:
    """The discriminator, not shape, decides the member -- including the hard cases.

    `no_data` and `error` have identical shapes, and a heartbeat is a subset of
    both. Parsing has to follow the tag.
    """
    now = datetime.now(UTC).isoformat()
    no_data = {"event": "no_data", "message": "nothing yet", "timestamp": now}
    error = {"event": "error", "message": "nothing yet", "timestamp": now}

    assert isinstance(GlucoseStreamEvent.model_validate(no_data).root, SseNoDataPayload)
    assert isinstance(GlucoseStreamEvent.model_validate(error).root, SseErrorPayload)

    # A heartbeat's fields are a strict subset of every other member's, so a
    # shape-matching union would decode a glucose reading as a keep-alive. Under the
    # discriminator the tag decides: a body tagged `glucose` but shaped like a
    # heartbeat is a hard failure, not a silent misparse.
    with pytest.raises(ValidationError):
        GlucoseStreamEvent.model_validate({"event": "glucose", "timestamp": now})

    # An unrecognised tag is rejected outright rather than falling through to
    # whichever member happens to fit.
    with pytest.raises(ValidationError):
        GlucoseStreamEvent.model_validate({"event": "made_up", "timestamp": now})


# --------------------------------------------------------------------------
# 3. The published schemas describe what the routers actually emit
# --------------------------------------------------------------------------


def test_iob_payload_matches_its_schema(projection: IoBProjection) -> None:
    """The router's `iob` sub-object is built from the published model itself."""
    iob = build_iob_payload(projection)
    assert isinstance(iob, SseIobPayload)
    assert iob.current == projection.projected_iob
    assert iob.is_stale is projection.is_stale
    assert set(iob.model_dump()) == set(SseIobPayload.model_fields)


def test_glucose_payload_matches_its_schema(
    reading: GlucoseReading, projection: IoBProjection
) -> None:
    """A real `glucose` event body validates against SseGlucosePayload."""
    payload = build_glucose_payload(
        reading,
        minutes_ago=3,
        is_stale=False,
        iob=build_iob_payload(projection),
        now=datetime.now(UTC),
    )
    assert set(payload) == set(SseGlucosePayload.model_fields)
    parsed = SseGlucosePayload.model_validate(payload)
    # mg/dL is the canonical storage unit and the stream must not convert.
    assert parsed.value == reading.value
    assert parsed.iob is not None
    assert parsed.iob.current == projection.projected_iob
    assert isinstance(
        GlucoseStreamEvent.model_validate(payload).root, SseGlucosePayload
    )


def test_glucose_payload_allows_absent_iob(reading: GlucoseReading) -> None:
    """`iob` is null when no projection is available, not omitted."""
    payload = build_glucose_payload(
        reading, minutes_ago=0, is_stale=False, iob=None, now=datetime.now(UTC)
    )
    assert SseGlucosePayload.model_validate(payload).iob is None


def test_glucose_payload_without_trend_publishes_the_unknown_literal(
    reading: GlucoseReading,
) -> None:
    """A reading with no trend emits `Unknown`, which the published type allows.

    `trend` is `TrendDirection | Literal["Unknown"]` rather than a bare string, so
    the fallback the router emits has to actually be in the published domain.
    """
    reading.trend = None
    payload = build_glucose_payload(
        reading, minutes_ago=1, is_stale=False, iob=None, now=datetime.now(UTC)
    )
    assert payload["trend"] == UNKNOWN_TREND
    assert SseGlucosePayload.model_validate(payload).trend == UNKNOWN_TREND


def test_glucose_stream_alert_payload_matches_its_schema(alert: Alert) -> None:
    """A real glucose-stream `alert` body validates against SseGlucoseAlertPayload."""
    payload = build_glucose_alert_payload(alert)
    assert set(payload) == set(SseGlucoseAlertPayload.model_fields)
    SseGlucoseAlertPayload.model_validate(payload)
    assert isinstance(
        GlucoseStreamEvent.model_validate(payload).root, SseGlucoseAlertPayload
    )


def test_no_data_payload_matches_its_schema() -> None:
    """A real `no_data` body validates, and resolves as `no_data`, not `error`."""
    payload = build_no_data_payload()
    assert set(payload) == set(SseNoDataPayload.model_fields)
    SseNoDataPayload.model_validate(payload)
    assert isinstance(GlucoseStreamEvent.model_validate(payload).root, SseNoDataPayload)


def test_error_payload_matches_its_schema() -> None:
    """A real `error` body validates, and resolves as `error`, not `no_data`."""
    payload = build_error_payload()
    assert set(payload) == set(SseErrorPayload.model_fields)
    SseErrorPayload.model_validate(payload)
    assert isinstance(GlucoseStreamEvent.model_validate(payload).root, SseErrorPayload)


def test_heartbeat_payload_matches_its_schema_on_both_streams() -> None:
    """The shared keep-alive body validates as a member of *both* unions."""
    payload = build_heartbeat_payload()
    assert set(payload) == set(SseHeartbeatPayload.model_fields)
    SseHeartbeatPayload.model_validate(payload)
    assert isinstance(
        GlucoseStreamEvent.model_validate(payload).root, SseHeartbeatPayload
    )
    assert isinstance(
        AlertStreamEvent.model_validate(payload).root, SseHeartbeatPayload
    )


def test_alert_stream_payload_matches_its_schema(alert: Alert) -> None:
    """The alert stream's body builder matches SseAlertPayload."""
    own = build_alert_stream_payload(alert)
    # patient_name is the one optional key: present only on a caregiver's stream.
    assert set(own) == set(SseAlertPayload.model_fields) - {"patient_name"}
    assert SseAlertPayload.model_validate(own).patient_name is None

    fanned_in = build_alert_stream_payload(alert, patient_name="patient@example.com")
    assert set(fanned_in) == set(SseAlertPayload.model_fields)
    assert SseAlertPayload.model_validate(fanned_in).patient_name is not None
    assert isinstance(AlertStreamEvent.model_validate(fanned_in).root, SseAlertPayload)
