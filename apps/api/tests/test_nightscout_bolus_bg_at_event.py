"""Mapper tests for issue #1023: Nightscout boluses must carry bg_at_event.

The correction analysis selects manual boluses with
`bg_at_event >= 150`; before this fix the Nightscout bolus mapper never
set the column, so the analysis reported insufficient data for every
NS-sourced account even when the treatment carried a glucose value.

These tests are pure mapper tests (no DB): they call
`map_treatment_to_pump_events` directly, so they run without a live
PostgreSQL instance. The CGM-reading backfill half of the fix lives in
`translator._backfill_bolus_context` and is covered by DB-backed tests
in test_nightscout_translator.py (CI).
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest

from src.core.units import MGDL_PER_MMOL
from src.services.integrations.nightscout.models import NightscoutTreatment
from src.services.integrations.nightscout.translator import (
    map_treatment_to_pump_events,
)

FIXTURE_ROOT = Path(__file__).parent / "fixtures" / "nightscout"

USER_ID = "00000000-0000-0000-0000-000000000001"
SOURCE = "nightscout:00000000-0000-0000-0000-000000000002"


def _map(
    raw: dict[str, Any], *, profile_units: str | None = None
) -> list[dict[str, Any]]:
    treatment = NightscoutTreatment.model_validate(raw)
    return map_treatment_to_pump_events(
        treatment,
        user_id=USER_ID,
        source=SOURCE,
        profile_units=profile_units,
    )


def _manual_bolus(**overrides: Any) -> dict[str, Any]:
    raw: dict[str, Any] = {
        "eventType": "Correction Bolus",
        "created_at": "2026-05-06T14:32:18Z",
        "enteredBy": "Loop",
        "insulin": 2.0,
        "type": "normal",
    }
    raw.update(overrides)
    return raw


class TestBolusGlucoseField:
    def test_glucose_mgdl_maps_to_bg_at_event(self):
        rows = _map(_manual_bolus(glucose=210))
        assert len(rows) == 1
        assert rows[0]["bg_at_event"] == 210

    def test_glucose_mmol_converted_to_mgdl(self):
        rows = _map(_manual_bolus(glucose=11.7, units="mmol"))
        assert len(rows) == 1
        assert rows[0]["bg_at_event"] == int(round(11.7 * MGDL_PER_MMOL))

    def test_glucose_mmol_slash_variant_converted(self):
        rows = _map(_manual_bolus(glucose=10.0, units="mmol/l"))
        assert len(rows) == 1
        assert rows[0]["bg_at_event"] == int(round(10.0 * MGDL_PER_MMOL))

    def test_glucose_mmol_litre_variant_converted(self):
        # Issue #1059: "mmol/litre" is a spelling the profile-side
        # normalizers recognize but the old two-spelling check missed.
        rows = _map(_manual_bolus(glucose=10.0, units="mmol/litre"))
        assert len(rows) == 1
        assert rows[0]["bg_at_event"] == int(round(10.0 * MGDL_PER_MMOL))

    def test_glucose_mmoll_variant_converted(self):
        rows = _map(_manual_bolus(glucose=10.0, units="mmoll"))
        assert len(rows) == 1
        assert rows[0]["bg_at_event"] == int(round(10.0 * MGDL_PER_MMOL))

    def test_glucose_mgdl_variant_not_converted(self):
        # Pass a conflicting mmol profile: if "mgdl" stopped being
        # recognized, the resolver would fall back to the profile units
        # and convert -- so this assertion now detects that regression.
        rows = _map(_manual_bolus(glucose=210, units="mgdl"), profile_units="mmol")
        assert len(rows) == 1
        assert rows[0]["bg_at_event"] == 210

    def test_missing_units_falls_back_to_profile_mmol(self):
        # Issue #1059: on an mmol site a treatment with no `units`
        # and a glucose of 25 was stored as 25 mg/dL.
        rows = _map(_manual_bolus(glucose=25), profile_units="mmol")
        assert len(rows) == 1
        assert rows[0]["bg_at_event"] == int(round(25 * MGDL_PER_MMOL))

    def test_missing_units_falls_back_to_profile_mmol_litre(self):
        rows = _map(_manual_bolus(glucose=25), profile_units="mmol/litre")
        assert len(rows) == 1
        assert rows[0]["bg_at_event"] == int(round(25 * MGDL_PER_MMOL))

    def test_missing_units_with_profile_mgdl_stays_mgdl(self):
        rows = _map(_manual_bolus(glucose=210), profile_units="mg/dl")
        assert len(rows) == 1
        assert rows[0]["bg_at_event"] == 210

    @pytest.mark.parametrize(
        ("glucose", "units", "profile_units", "expected"),
        [
            # Record units win over the profile fallback.
            (11.7, "mmol", "mg/dl", int(round(11.7 * MGDL_PER_MMOL))),
            (210, "mg/dl", "mmol", 210),
        ],
    )
    def test_record_units_win_over_profile_units(
        self, glucose, units, profile_units, expected
    ):
        rows = _map(
            _manual_bolus(glucose=glucose, units=units),
            profile_units=profile_units,
        )
        assert len(rows) == 1
        assert rows[0]["bg_at_event"] == expected

    def test_unrecognized_record_units_fall_back_to_profile(self):
        # A garbage `units` string must not silently mean mg/dL when
        # the profile says mmol.
        rows = _map(_manual_bolus(glucose=25, units="banana"), profile_units="mmol")
        assert len(rows) == 1
        assert rows[0]["bg_at_event"] == int(round(25 * MGDL_PER_MMOL))

    def test_meal_bolus_pair_bolus_row_uses_profile_units(self):
        fixture = json.loads(
            (FIXTURE_ROOT / "treatments" / "bolus_wizard_with_carbs.json").read_text()
        )
        fixture.pop("units", None)
        fixture["glucose"] = 10.0
        rows = _map(fixture, profile_units="mmol")
        assert len(rows) == 2
        bolus_row = next(r for r in rows if r["event_type"].value == "bolus")
        carbs_row = next(r for r in rows if r["event_type"].value == "carbs")
        assert bolus_row["bg_at_event"] == int(round(10.0 * MGDL_PER_MMOL))
        assert carbs_row.get("bg_at_event") is None

    def test_missing_glucose_stays_null(self):
        rows = _map(_manual_bolus())
        assert len(rows) == 1
        assert rows[0]["bg_at_event"] is None

    def test_zero_glucose_stays_null(self):
        # Some uploaders emit glucose: 0 for "no reading" -- it must not
        # become a real 0 mg/dL BG (which would also poison the
        # correction analysis threshold in the other direction).
        rows = _map(_manual_bolus(glucose=0))
        assert len(rows) == 1
        assert rows[0]["bg_at_event"] is None

    @pytest.mark.parametrize(
        ("glucose", "units", "expected"),
        [
            (19, "mg/dL", None),
            (20, "mg/dL", 20),
            (500, "mg/dL", 500),
            (501, "mg/dL", None),
            (1.1, "mmol", 20),
            (27.8, "mmol", None),
        ],
    )
    def test_glucose_bounds_for_bg_at_event(self, glucose, units, expected):
        # BolusReviewItem declares bg_at_event ge=20, le=500: values
        # outside that range stay NULL (for the CGM backfill to cover)
        # instead of failing the review endpoint at read time.
        rows = _map(_manual_bolus(glucose=glucose, units=units))
        assert len(rows) == 1
        assert rows[0]["bg_at_event"] == expected

    def test_negative_glucose_stays_null(self):
        rows = _map(_manual_bolus(glucose=-5))
        assert len(rows) == 1
        assert rows[0]["bg_at_event"] is None

    def test_huge_mmol_glucose_stays_null(self):
        # A huge mmol value overflows to inf on mg/dL conversion,
        # and int(round(inf)) raises OverflowError -- it must stay
        # NULL instead of crashing the sync.
        rows = _map(_manual_bolus(glucose=1e308, units="mmol"))
        assert len(rows) == 1
        assert rows[0]["bg_at_event"] is None

    def test_huge_mgdl_glucose_stays_null(self):
        rows = _map(_manual_bolus(glucose=1e308))
        assert len(rows) == 1
        assert rows[0]["bg_at_event"] is None

    def test_automated_bolus_still_carries_bg(self):
        # The correction analysis only reads manual boluses, but the
        # dashboard's Recent Boluses table reads bg_at_event for every
        # bolus row -- automated boluses keep their BG too.
        rows = _map(_manual_bolus(glucose=180, automatic=True))
        assert len(rows) == 1
        assert rows[0]["bg_at_event"] == 180
        assert rows[0]["is_automated"] is True

    def test_meal_bolus_pair_bolus_row_carries_bg(self):
        fixture = json.loads(
            (FIXTURE_ROOT / "treatments" / "bolus_wizard_with_carbs.json").read_text()
        )
        assert fixture["glucose"] == 145
        rows = _map(fixture)
        assert len(rows) == 2
        bolus_row = next(r for r in rows if r["event_type"].value == "bolus")
        carbs_row = next(r for r in rows if r["event_type"].value == "carbs")
        assert bolus_row["bg_at_event"] == 145
        assert carbs_row.get("bg_at_event") is None
