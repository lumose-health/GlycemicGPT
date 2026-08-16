"""Gates for the exported OpenAPI contract, `contracts/openapi.json` (GLY-179).

This is the artifact client generators (GLY-180 TypeScript, GLY-181 Kotlin/Swift)
build from, so three things have to hold and keep holding:

1. It is byte-identical to the document the app serves -- generating clients from a
   stale or decorated spec is exactly the silent drift this epic exists to stop.
2. It agrees with `apps/api/contract/openapi.json`, the version-stamped pin the
   Android repo consumes, modulo the stamp. Two committed copies of one document
   are only safe if their relationship is enforced.
3. The SSE streams publish named payload schemas, and those schemas actually
   describe what the routers emit.

If any of these fails: run `./scripts/regen-contracts.sh` and commit the result
(bumping `apps/api/contract/CONTRACT_VERSION` first if the surface changed).
"""

from __future__ import annotations

import json
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest

from src.models.alert import Alert, AlertSeverity, AlertType
from src.models.glucose import GlucoseReading, TrendDirection
from src.openapi_contract import (
    EXPORTED_DISPLAY_PATH,
    exported_of,
    generate_exported_spec,
    generate_spec,
    load_committed,
    load_exported,
    serialize_spec,
)
from src.routers.alert_api import alert_to_dict
from src.routers.glucose_stream import build_alert_payload, build_glucose_payload
from src.schemas.stream_events import (
    AlertStreamEvent,
    GlucoseStreamEvent,
    SseAlertPayload,
    SseGlucoseAlertPayload,
    SseGlucosePayload,
)

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

    The security suite fuzzes the *served* document while clients are generated
    from the committed one. This is the assertion that keeps those two the same
    API -- checking `app.openapi()` alone would not catch the endpoint diverging.
    """
    response = await client.get("/openapi.json")
    assert response.status_code == 200
    assert response.json() == json.loads(load_exported()), STALE_MESSAGE


def test_exported_contract_carries_no_build_time_decoration() -> None:
    """The export is the served document -- no contract-version stamp, no extras.

    The security suite fuzzes the *served* `/openapi.json`; if the exported file
    grew decoration, the fuzzed surface and the generated clients would describe
    two different APIs.
    """
    exported = json.loads(load_exported())
    assert "x-contract-version" not in exported["info"]


def test_exported_and_versioned_artifacts_agree() -> None:
    """The two committed copies are one document modulo the version stamp.

    `apps/api/contract/openapi.json` is pinned by path from the Android repo, so it
    cannot move yet; this keeps the duplicate honest until it is consolidated.
    """
    assert json.loads(load_exported()) == exported_of(json.loads(load_committed()))
    # Guard against the invariant being trivially satisfied by a stampless pin.
    assert "x-contract-version" in json.loads(load_committed())["info"]


def test_exported_spec_equals_stripped_versioned_spec() -> None:
    """The same relationship holds for freshly generated specs, not just the files."""
    assert generate_exported_spec() == exported_of(generate_spec())


# --------------------------------------------------------------------------
# 2. The SSE streams publish named payload schemas
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
        members = {m["$ref"].rsplit("/", 1)[-1] for m in schemas[union]["anyOf"]}
        assert members <= set(schemas), f"{union} references an unpublished schema"


# --------------------------------------------------------------------------
# 3. The published schemas describe what the routers actually emit
# --------------------------------------------------------------------------


def test_glucose_payload_matches_its_schema(reading: GlucoseReading) -> None:
    """A real `glucose` event body validates against SseGlucosePayload."""
    payload = build_glucose_payload(
        reading,
        minutes_ago=3,
        is_stale=False,
        iob={"current": 1.25, "is_stale": False},
        now=datetime.now(UTC),
    )
    assert set(payload) == set(SseGlucosePayload.model_fields)
    parsed = SseGlucosePayload.model_validate(payload)
    # mg/dL is the canonical storage unit and the stream must not convert.
    assert parsed.value == reading.value
    assert parsed.iob is not None
    GlucoseStreamEvent.model_validate(payload)


def test_glucose_payload_allows_absent_iob(reading: GlucoseReading) -> None:
    """`iob` is null when no projection is available, not omitted."""
    payload = build_glucose_payload(
        reading, minutes_ago=0, is_stale=False, iob=None, now=datetime.now(UTC)
    )
    assert SseGlucosePayload.model_validate(payload).iob is None


def test_glucose_stream_alert_payload_matches_its_schema(alert: Alert) -> None:
    """A real glucose-stream `alert` body validates against SseGlucoseAlertPayload."""
    payload = build_alert_payload(alert)
    assert set(payload) == set(SseGlucoseAlertPayload.model_fields)
    SseGlucoseAlertPayload.model_validate(payload)
    GlucoseStreamEvent.model_validate(payload)


def test_alert_stream_payload_matches_its_schema(alert: Alert) -> None:
    """`alert_to_dict` -- the alert stream's body builder -- matches SseAlertPayload."""
    own = alert_to_dict(alert)
    # patient_name is the one optional key: present only on a caregiver's stream.
    assert set(own) == set(SseAlertPayload.model_fields) - {"patient_name"}
    assert SseAlertPayload.model_validate(own).patient_name is None

    fanned_in = alert_to_dict(alert, patient_name="patient@example.com")
    assert set(fanned_in) == set(SseAlertPayload.model_fields)
    assert SseAlertPayload.model_validate(fanned_in).patient_name is not None
    AlertStreamEvent.model_validate(fanned_in)
