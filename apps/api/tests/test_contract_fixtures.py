"""Shared contract fixtures under contracts/fixtures/, validated against the
Pydantic schemas that define their shapes (GLY-181).

Each fixture is parsed through the model that owns its wire shape and
round-tripped (model_validate -> model_dump(mode="json") -> model_validate
again) so a field that silently stops round-tripping fails here instead of
surfacing downstream. Semantic assertions alongside the type checks pin the
platform safety invariants (glucose 20-500 mg/dL canonical mg/dL, insulin in
units, basal in units/hour, manual vs automated not conflated) so a fixture
can't drift into an unsafe or misleading example even though Pydantic's field
bounds already reject the worst cases.

apps/web/src/mocks/fixtures.ts is the TypeScript half: it imports the same
JSON files and types them against the generated `Schemas[...]` types, so a
backend shape change that isn't reflected here fails `tsc` there.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest

from src.core.treatment_safety.models import MAX_GLUCOSE_MGDL, MIN_GLUCOSE_MGDL
from src.models.integration import IntegrationStatus, IntegrationType
from src.models.pump_data import MAX_BASAL_INJECTION_UNITS, PumpEventType
from src.schemas.alert import AlertResponse
from src.schemas.forecast import ForecastReadResponse
from src.schemas.glucose import GlucoseReadingResponse
from src.schemas.integration import IntegrationResponse
from src.schemas.pump import BolusReviewItem, PumpEventResponse
from src.schemas.stream_events import SseAlertPayload, SseGlucosePayload

FIXTURES_DIR = Path(__file__).resolve().parents[3] / "contracts" / "fixtures"


def load_fixture(name: str) -> dict[str, Any]:
    return json.loads((FIXTURES_DIR / name).read_text())


def round_trip(model_cls: type, payload: dict[str, Any]) -> Any:
    """Parse, dump, and reparse -- a field that doesn't survive the round
    trip (a typo, a dropped default, a mismatched alias) fails here."""
    parsed = model_cls.model_validate(payload)
    dumped = parsed.model_dump(mode="json")
    reparsed = model_cls.model_validate(dumped)
    assert reparsed == parsed
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


@pytest.mark.parametrize(
    "filename",
    [
        "pump_event_manual_meal_bolus.json",
        "pump_event_manual_correction.json",
        "pump_event_automated_correction.json",
        "pump_event_nightscout_smb.json",
        "pump_event_basal_rate.json",
        "pump_event_long_acting_basal_injection.json",
        "pump_event_suspend.json",
        "pump_event_resume.json",
    ],
)
def test_pump_event_fixtures_are_valid(filename: str) -> None:
    event = round_trip(PumpEventResponse, load_fixture(filename))
    assert event.event_type in set(PumpEventType)
    if event.units is not None:
        assert event.units >= 0


def test_manual_meal_bolus_carries_meal_evidence() -> None:
    """cob_at_event is the only positive evidence of meal purpose -- absent
    it, nothing downstream may guess "meal"."""
    event = round_trip(
        PumpEventResponse, load_fixture("pump_event_manual_meal_bolus.json")
    )
    assert event.event_type == PumpEventType.BOLUS
    assert event.is_automated is False
    assert event.cob_at_event is not None
    assert event.cob_at_event > 0


def test_manual_correction_carries_no_meal_evidence_and_known_source() -> None:
    """A manual correction bolus is wire-identical in event_type to a meal
    bolus; only cob_at_event (absent here) and source (populated, not a
    guess) distinguish it. Nothing may infer "correction" from event_type
    alone -- event_type is "bolus" for both fixtures."""
    event = round_trip(
        PumpEventResponse, load_fixture("pump_event_manual_correction.json")
    )
    assert event.event_type == PumpEventType.BOLUS
    assert event.is_automated is False
    assert event.cob_at_event is None
    assert event.source  # known, non-empty source -- not an unattributed guess


def test_automated_correction_is_flagged_automated() -> None:
    event = round_trip(
        PumpEventResponse, load_fixture("pump_event_automated_correction.json")
    )
    assert event.event_type == PumpEventType.CORRECTION
    assert event.is_automated is True


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
    assert event.source.startswith("nightscout")


def test_basal_rate_is_a_rate_over_a_duration() -> None:
    event = round_trip(PumpEventResponse, load_fixture("pump_event_basal_rate.json"))
    assert event.event_type == PumpEventType.BASAL
    assert event.duration_minutes is not None
    assert event.duration_minutes > 0
    # A basal rate (U/h), not a bolus-sized dose -- plausible pump rate range.
    assert event.units is not None
    assert 0 < event.units < 15


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
# ---------------------------------------------------------------------------


def test_active_alert_fixture() -> None:
    alert = round_trip(AlertResponse, load_fixture("active_alert.json"))
    assert MIN_GLUCOSE_MGDL <= alert.current_value <= MAX_GLUCOSE_MGDL
    assert alert.expires_at > alert.created_at


def test_live_glucose_event_fixture() -> None:
    event = round_trip(SseGlucosePayload, load_fixture("live_glucose_event.json"))
    assert event.event == "glucose"
    assert MIN_GLUCOSE_MGDL <= event.value <= MAX_GLUCOSE_MGDL


def test_live_alert_event_fixture() -> None:
    event = round_trip(SseAlertPayload, load_fixture("live_alert_event.json"))
    assert event.event == "alert"
    assert MIN_GLUCOSE_MGDL <= event.current_value <= MAX_GLUCOSE_MGDL


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
# Unknown future event type -- the deliberately open escape hatch
# ---------------------------------------------------------------------------


def test_unknown_event_type_round_trips_through_bolus_review_item() -> None:
    """BolusReviewItem.event_type is a plain str (not the PumpEventType
    enum), so a value the backend has never seen still passes validation
    instead of 422ing the whole review response -- see the docstring on the
    schema. This is the one place the wire deliberately allows it."""
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
    every pump-event surface, only the one designed for it."""
    unknown_value = load_fixture("bolus_review_unknown_event_type.json")["event_type"]
    payload = dict(load_fixture("pump_event_manual_meal_bolus.json"))
    payload["event_type"] = unknown_value
    with pytest.raises(ValueError):
        PumpEventResponse.model_validate(payload)


# ---------------------------------------------------------------------------
# Every fixture file on disk is exercised by a test above
# ---------------------------------------------------------------------------


def test_every_fixture_file_is_exercised() -> None:
    covered = {
        "glucose_reading.json",
        "pump_event_manual_meal_bolus.json",
        "pump_event_manual_correction.json",
        "pump_event_automated_correction.json",
        "pump_event_nightscout_smb.json",
        "pump_event_basal_rate.json",
        "pump_event_long_acting_basal_injection.json",
        "pump_event_suspend.json",
        "pump_event_resume.json",
        "forecast_response.json",
        "active_alert.json",
        "live_glucose_event.json",
        "live_alert_event.json",
        "integration_connection_state.json",
        "bolus_review_unknown_event_type.json",
    }
    on_disk = {path.name for path in FIXTURES_DIR.glob("*.json")}
    assert on_disk == covered
