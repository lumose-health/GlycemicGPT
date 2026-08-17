"""Shared contract fixtures under contracts/fixtures/, validated against the
Pydantic schemas that define their shapes (GLY-181).

Each fixture is parsed through the model that owns its wire shape and
round-tripped (model_validate -> model_dump(mode="json") -> model_validate
again), and its key set is compared with the model's own, so a field the
backend renames or drops fails here instead of leaving a stale example in the
shared JSON that the TypeScript/Kotlin/Swift halves keep trusting.

Parsing alone is not enough: `control_iq_reason`, `source`, `alert_type`,
`severity` and `pump_activity_mode` are plain `str` on their schemas, so a
value the backend can never emit still validates. Every one of those fields is
therefore checked against the enum or the pinned allowlist the producing code
actually writes, alongside semantic assertions pinning the platform safety
invariants (glucose 20-500 mg/dL canonical, insulin in units, basal in
units/hour, manual vs automated not conflated).

apps/web/src/mocks/fixtures.ts is the TypeScript half: it imports the same
JSON files and types them against the `@/lib/api` aliases over the generated
contract, so a backend shape change that isn't reflected here fails `tsc`
there.
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

import pytest

from src.core.treatment_safety.models import MAX_GLUCOSE_MGDL, MIN_GLUCOSE_MGDL
from src.models.alert import AlertSeverity, AlertType
from src.models.alert_threshold import AlertThreshold
from src.models.integration import IntegrationStatus, IntegrationType
from src.models.pump_data import (
    MAX_BASAL_INJECTION_UNITS,
    PumpActivityMode,
    PumpEventType,
)
from src.schemas.alert import AlertResponse
from src.schemas.forecast import ForecastReadResponse
from src.schemas.glucose import GlucoseReadingResponse
from src.schemas.integration import IntegrationResponse
from src.schemas.pump import BolusReviewItem, PumpEventResponse
from src.schemas.stream_events import SseAlertPayload, SseGlucosePayload
from src.services.integrations.nightscout.models import NIGHTSCOUT_SOURCE_PREFIX
from src.services.predictive_alerts import (
    PREDICTION_HORIZONS,
    calculate_trajectory,
    check_threshold_crossings,
)

FIXTURES_DIR = Path(__file__).resolve().parents[3] / "contracts" / "fixtures"

# Fixture filenames, grouped by the model that owns their shape. These lists are
# the single Python-side inventory: the tests below parametrize over them and
# `test_every_fixture_file_is_exercised` globs the directory against their union,
# so a file added to `contracts/fixtures/` without a test here fails.
PUMP_EVENT_FIXTURES = [
    "pump_event_manual_meal_bolus.json",
    "pump_event_manual_correction.json",
    "pump_event_automated_correction.json",
    "pump_event_nightscout_smb.json",
    "pump_event_basal_rate.json",
    "pump_event_long_acting_basal_injection.json",
    "pump_event_suspend.json",
    "pump_event_resume.json",
]

LIVE_ALERT_EVENT_FIXTURES = [
    "live_alert_event.json",
    "live_alert_event_caregiver.json",
]

ALL_FIXTURES = frozenset(
    PUMP_EVENT_FIXTURES
    + LIVE_ALERT_EVENT_FIXTURES
    + [
        "glucose_reading.json",
        "forecast_response.json",
        "active_alert.json",
        "live_glucose_event.json",
        "integration_connection_state.json",
        "bolus_review_unknown_event_type.json",
    ]
)

# `control_iq_reason` is a free-form `str` on PumpEventResponse, so the schema
# cannot reject a value no producer writes. This is the closed set the mappers
# actually emit: tandem_sync.map_event_type / parse_control_iq_event write
# correction | suspend | basal_adjustment | basal_increase | basal_decrease |
# basal_unchanged, and the Nightscout treatment models add temp_basal.
CONTROL_IQ_REASONS = frozenset(
    {
        "correction",
        "basal_adjustment",
        "basal_increase",
        "basal_decrease",
        "basal_unchanged",
        "suspend",
        "temp_basal",
    }
)

# Likewise for `source` on a pump event: direct integrations stamp their own
# name, and every Nightscout-mediated row carries `nightscout:<connection_id>`
# (translator._build_source). A bare uploader name like "nightscout-aaps" is NOT
# a value the backend can produce.
DIRECT_PUMP_EVENT_SOURCES = frozenset({"tandem", "glooko", "medtronic"})
NIGHTSCOUT_SOURCE_RE = re.compile(
    rf"^{re.escape(NIGHTSCOUT_SOURCE_PREFIX)}[0-9a-fA-F-]{{36}}$"
)

# The engine's own defaults (models.alert_threshold column defaults). The
# alert fixtures are derived against these, so a threshold change surfaces as a
# failed derivation rather than a stale example.
DEFAULT_THRESHOLDS = AlertThreshold(
    low_warning=70.0,
    urgent_low=55.0,
    high_warning=180.0,
    urgent_high=250.0,
    iob_warning=3.0,
)


def load_fixture(name: str) -> dict[str, Any]:
    return json.loads((FIXTURES_DIR / name).read_text())


def round_trip(
    model_cls: type,
    payload: dict[str, Any],
    *,
    omitted_when_unset: frozenset[str] = frozenset(),
) -> Any:
    """Parse, dump, reparse, and compare key sets.

    The round trip catches a field that doesn't survive serialization (a typo,
    a dropped default, a mismatched alias). The key-set comparison catches the
    drift the round trip cannot see: Pydantic silently ignores unknown keys, so
    a field the backend removed would otherwise sit in the shared JSON forever
    and keep teaching every client a shape the wire no longer carries.

    `omitted_when_unset` names fields the producer only writes conditionally
    (the backend omits the key entirely rather than sending null), so the model
    emits them but the fixture legitimately does not.
    """
    parsed = model_cls.model_validate(payload)
    dumped = parsed.model_dump(mode="json")
    assert model_cls.model_validate(dumped) == parsed
    assert set(dumped) - set(payload) == set(omitted_when_unset)
    assert set(payload) - set(dumped) == set()
    return parsed


# ---------------------------------------------------------------------------
# Glucose reading
# ---------------------------------------------------------------------------


def test_glucose_reading_fixture() -> None:
    reading = round_trip(GlucoseReadingResponse, load_fixture("glucose_reading.json"))
    assert MIN_GLUCOSE_MGDL <= reading.value <= MAX_GLUCOSE_MGDL
    assert reading.received_at >= reading.reading_timestamp


# ---------------------------------------------------------------------------
# Pump / insulin events
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("filename", PUMP_EVENT_FIXTURES)
def test_pump_event_fixtures_carry_only_emittable_values(filename: str) -> None:
    """Every free-form string field on a pump event must hold a value some
    producer actually writes -- the schema types them as `str`, so this is the
    only place a fabricated value is caught."""
    event = round_trip(PumpEventResponse, load_fixture(filename))

    if event.pump_activity_mode is not None:
        assert event.pump_activity_mode in {m.value for m in PumpActivityMode}
    if event.control_iq_reason is not None:
        assert event.control_iq_reason in CONTROL_IQ_REASONS
    assert (
        event.source in DIRECT_PUMP_EVENT_SOURCES
        or NIGHTSCOUT_SOURCE_RE.match(event.source) is not None
    )
    if event.units is not None:
        assert event.units >= 0


def test_manual_meal_bolus_carries_meal_evidence() -> None:
    """cob_at_event is the only positive evidence of meal purpose -- absent
    it, nothing downstream may guess "meal"."""
    event = round_trip(
        PumpEventResponse, load_fixture("pump_event_manual_meal_bolus.json")
    )
    assert event.is_automated is False
    assert event.cob_at_event is not None
    assert event.cob_at_event > 0


def test_manual_correction_carries_no_meal_evidence_and_known_source() -> None:
    """A manual correction bolus is wire-identical in event_type to a meal
    bolus; only cob_at_event (absent here) and source (populated, not a
    guess) distinguish it. Nothing may infer "correction" from event_type
    alone -- event_type is "bolus" for both fixtures."""
    correction = round_trip(
        PumpEventResponse, load_fixture("pump_event_manual_correction.json")
    )
    meal = round_trip(
        PumpEventResponse, load_fixture("pump_event_manual_meal_bolus.json")
    )
    assert correction.event_type == meal.event_type == PumpEventType.BOLUS
    assert correction.is_automated is False
    assert correction.cob_at_event is None
    assert correction.source  # known, non-empty source -- not an unattributed guess


def test_automated_correction_is_flagged_automated() -> None:
    event = round_trip(
        PumpEventResponse, load_fixture("pump_event_automated_correction.json")
    )
    assert event.event_type == PumpEventType.CORRECTION
    assert event.is_automated is True
    # tandem_sync.map_event_type stamps exactly this reason on a Control-IQ
    # correction; anything else means the fixture was invented, not observed.
    assert event.control_iq_reason == "correction"


def test_nightscout_smb_reports_bolus_event_type_but_is_automated() -> None:
    """A Nightscout SMB lands as event_type=bolus (matching
    `_pump_events_mapper._map_bolus`) -- `is_automated` is the ONLY field
    that marks it automated. A consumer that infers "manual" from
    `event_type == "bolus"` would misclassify this exact case, conflating
    manual and automated delivery."""
    event = round_trip(
        PumpEventResponse, load_fixture("pump_event_nightscout_smb.json")
    )
    assert event.event_type == PumpEventType.BOLUS
    assert event.is_automated is True
    # Not merely "starts with nightscout": the translator stamps
    # `nightscout:<connection_id>`, so an uploader label such as
    # "nightscout-aaps" (which no producer writes) must fail here.
    assert NIGHTSCOUT_SOURCE_RE.match(event.source) is not None


def test_basal_rate_is_a_rate_over_a_duration() -> None:
    event = round_trip(PumpEventResponse, load_fixture("pump_event_basal_rate.json"))
    assert event.event_type == PumpEventType.BASAL
    assert event.duration_minutes is not None
    assert event.duration_minutes > 0
    # A basal rate (U/h), not a bolus-sized dose -- plausible pump rate range.
    assert event.units is not None
    assert 0 < event.units < 15
    # parse_control_iq_event refines the reason by adjustment direction, so an
    # automated basal with a positive basal_adjustment_pct is "basal_increase".
    assert event.is_automated is True
    assert event.basal_adjustment_pct is not None
    assert event.basal_adjustment_pct > 0
    assert event.control_iq_reason == "basal_increase"


def test_long_acting_basal_injection_is_an_absolute_dose_not_a_rate() -> None:
    event = round_trip(
        PumpEventResponse, load_fixture("pump_event_long_acting_basal_injection.json")
    )
    assert event.event_type == PumpEventType.BASAL_INJECTION
    assert event.duration_minutes is None
    assert event.units is not None
    assert 0 < event.units <= MAX_BASAL_INJECTION_UNITS


def test_suspend_and_resume_produce_expected_delivery_interval() -> None:
    suspend = round_trip(PumpEventResponse, load_fixture("pump_event_suspend.json"))
    resume = round_trip(PumpEventResponse, load_fixture("pump_event_resume.json"))
    assert suspend.event_type == PumpEventType.SUSPEND
    assert resume.event_type == PumpEventType.RESUME
    assert suspend.units is None
    assert resume.units is None
    assert resume.event_timestamp > suspend.event_timestamp
    suspended_minutes = (
        resume.event_timestamp - suspend.event_timestamp
    ).total_seconds() / 60
    assert 0 < suspended_minutes <= 180
    # map_event_type sets "suspend" on an automated suspend and leaves the
    # reason unset on the matching resume -- the pair is asymmetric on the wire.
    assert suspend.control_iq_reason == "suspend"
    assert resume.control_iq_reason is None


# ---------------------------------------------------------------------------
# Forecast
# ---------------------------------------------------------------------------


def test_forecast_response_fixture() -> None:
    forecast = round_trip(ForecastReadResponse, load_fixture("forecast_response.json"))
    assert forecast.forecast is not None
    curve = forecast.forecast.curves_mgdl.main
    assert curve is not None
    expected_points = (
        forecast.forecast.horizon_minutes // forecast.forecast.step_minutes
    )
    assert len(curve) == expected_points
    for value in curve:
        assert MIN_GLUCOSE_MGDL <= value <= MAX_GLUCOSE_MGDL


# ---------------------------------------------------------------------------
# Alerts
#
# `alert_type`, `severity` and `source` are plain strings on AlertResponse and
# on the SSE payloads, so the fixtures are derived from the real engine rather
# than asserted against by eye: the same trajectory and thresholds must produce
# the fixture's type, severity, predicted value, horizon and message text.
# ---------------------------------------------------------------------------


def test_active_alert_fixture() -> None:
    alert = round_trip(AlertResponse, load_fixture("active_alert.json"))
    assert MIN_GLUCOSE_MGDL <= alert.current_value <= MAX_GLUCOSE_MGDL
    assert alert.expires_at > alert.created_at
    assert alert.alert_type in {t.value for t in AlertType}
    assert alert.severity in {s.value for s in AlertSeverity}
    assert alert.source in {"predictive", "current", "iob"}
    assert alert.prediction_minutes in PREDICTION_HORIZONS


def test_active_alert_fixture_is_what_the_engine_would_emit() -> None:
    """Replay the fixture's own inputs through the real alert engine: the
    predicted value, horizon, type, severity and message text must all be what
    `check_threshold_crossings` produces, not plausible-looking prose."""
    alert = AlertResponse.model_validate(load_fixture("active_alert.json"))
    assert alert.trend_rate is not None

    trajectory = calculate_trajectory(alert.current_value, alert.trend_rate)
    candidates = check_threshold_crossings(
        trajectory, DEFAULT_THRESHOLDS, alert.iob_value
    )

    assert len(candidates) == 1
    candidate = candidates[0]
    assert candidate.alert_type.value == alert.alert_type
    assert candidate.severity.value == alert.severity
    assert candidate.source == alert.source
    assert candidate.predicted_value == alert.predicted_value
    assert candidate.prediction_minutes == alert.prediction_minutes
    assert candidate.message == alert.message


def test_live_glucose_event_fixture() -> None:
    event = round_trip(SseGlucosePayload, load_fixture("live_glucose_event.json"))
    assert MIN_GLUCOSE_MGDL <= event.value <= MAX_GLUCOSE_MGDL


@pytest.mark.parametrize("filename", LIVE_ALERT_EVENT_FIXTURES)
def test_live_alert_event_fixtures(filename: str) -> None:
    payload = load_fixture(filename)
    # `alert_api.alert_to_dict` adds `patient_name` only for a caregiver's
    # stream, so a diabetic user's event omits the key entirely rather than
    # sending null -- both forms are on the wire and both are fixtured.
    caregiver = "patient_name" in payload
    event = round_trip(
        SseAlertPayload,
        payload,
        omitted_when_unset=frozenset() if caregiver else frozenset({"patient_name"}),
    )
    assert MIN_GLUCOSE_MGDL <= event.current_value <= MAX_GLUCOSE_MGDL
    assert event.alert_type in {t.value for t in AlertType}
    assert event.severity in {s.value for s in AlertSeverity}
    assert (event.patient_name is not None) is caregiver


@pytest.mark.parametrize("filename", LIVE_ALERT_EVENT_FIXTURES)
def test_live_alert_event_fixture_is_what_the_engine_would_emit(filename: str) -> None:
    event = SseAlertPayload.model_validate(load_fixture(filename))
    assert event.trend_rate is not None

    trajectory = calculate_trajectory(event.current_value, event.trend_rate)
    candidates = check_threshold_crossings(
        trajectory, DEFAULT_THRESHOLDS, event.iob_value
    )

    assert len(candidates) == 1
    candidate = candidates[0]
    assert candidate.alert_type.value == event.alert_type
    assert candidate.severity.value == event.severity
    assert candidate.predicted_value == event.predicted_value
    assert candidate.message == event.message


# ---------------------------------------------------------------------------
# Integration connection state
# ---------------------------------------------------------------------------


def test_integration_connection_state_fixture() -> None:
    integration = round_trip(
        IntegrationResponse, load_fixture("integration_connection_state.json")
    )
    assert integration.status == IntegrationStatus.CONNECTED
    assert integration.integration_type == IntegrationType.TANDEM


# ---------------------------------------------------------------------------
# Unknown future event type -- the one loosely-typed field on the wire
# ---------------------------------------------------------------------------


def test_unknown_event_type_round_trips_through_bolus_review_item() -> None:
    """`BolusReviewItem.event_type` is a plain `str` whose description names
    only `bolus | correction | basal_injection`; nothing pins the wire to that
    list, so an unrecognized value validates instead of 422ing the whole review
    response. That looseness is a KNOWN GAP, not a designed escape hatch --
    closing it with a `Literal` is filed as GLY-241 (see the comment on
    `BolusReviewItem` in web `lib/api.ts` and `insulin-timeline-data.ts`). Until
    then every consumer must gate on `isKnownBolusReviewEventType`, and this
    fixture is what proves they do."""
    item = round_trip(
        BolusReviewItem, load_fixture("bolus_review_unknown_event_type.json")
    )
    known_values = {member.value for member in PumpEventType}
    assert item.event_type not in known_values
    assert item.event_type != "bolus"


def test_unknown_event_type_is_rejected_by_the_closed_pump_event_type_enum() -> None:
    """The same value is NOT a legal PumpEventResponse.event_type -- that
    schema's enum is closed and has no unknown-value fallback, unlike
    BolusReviewItem. An unknown event type must never silently pass through
    every pump-event surface, only the one whose type is still loose."""
    unknown_value = load_fixture("bolus_review_unknown_event_type.json")["event_type"]
    payload = dict(load_fixture("pump_event_manual_meal_bolus.json"))
    payload["event_type"] = unknown_value
    with pytest.raises(ValueError):
        PumpEventResponse.model_validate(payload)


# ---------------------------------------------------------------------------
# Every fixture file on disk is exercised by a test above
# ---------------------------------------------------------------------------


def test_every_fixture_file_is_exercised() -> None:
    on_disk = {path.name for path in FIXTURES_DIR.glob("*.json")}
    assert on_disk == set(ALL_FIXTURES)
