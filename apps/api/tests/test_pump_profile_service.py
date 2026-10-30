"""Tests for the Nightscout pump-profile merge (issue #1016).

Nightscout's basal, ISF and carb-ratio schedules have independent
breakpoints. The merge must carry each schedule's value in force across
breakpoints it doesn't define instead of zero-filling, and the AI prompt
must never present an unknown value as 0.
"""

import uuid
from unittest.mock import AsyncMock, MagicMock

import pytest

from src.schemas.nightscout import (
    OnboardingDerivation,
    OnboardingNumericFieldDerivation,
    OnboardingScheduleFieldDerivation,
    OnboardingScheduleSegment,
)
from src.services.diabetes_context import (
    ProfileSegment,
    PumpProfileSummary,
    format_pump_profile_for_prompt,
)
from src.services.pump_profile import (
    _merge_segments,
    _target_in_force,
    _target_schedule_by_start,
    _value_in_force,
    upsert_from_onboarding,
)

# Reporter's synthetic case: basal 0.8 U/h from 06:00-10:00, an 08:00
# breakpoint that exists only in the carb-ratio schedule, and a single ISF
# entry from midnight.
REPORTER_BASAL = {0: 0.6, 360: 0.8, 600: 0.7}
REPORTER_CARB_RATIO = {0: 10.0, 480: 12.0}
REPORTER_ISF = {0: 50.0}


def _to_summary(segments: list[dict]) -> PumpProfileSummary:
    return PumpProfileSummary(
        profile_name="Nightscout",
        segments=[
            ProfileSegment(
                time=seg["time"],
                start_minutes=seg["start_minutes"],
                basal_rate=seg["basal_rate"],
                correction_factor=seg["correction_factor"],
                carb_ratio=seg["carb_ratio"],
                target_bg=seg["target_bg"],
            )
            for seg in segments
        ],
    )


def _assert_no_unknowns_rendered(text: str) -> None:
    for unknown in ("Basal 0.000", "CF 1:0", "CR 1:0", "Target 0"):
        assert unknown not in text


class TestValueInForce:
    def test_empty_schedule_is_sentinel(self):
        assert _value_in_force({}, 480) == 0.0

    def test_exact_breakpoint(self):
        assert _value_in_force(REPORTER_BASAL, 360) == 0.8

    def test_between_breakpoints_carries_forward(self):
        assert _value_in_force(REPORTER_BASAL, 480) == 0.8

    def test_before_first_entry_wraps_to_last(self):
        assert _value_in_force({360: 0.8, 600: 0.7}, 0) == 0.7
        assert _value_in_force({360: 0.8, 600: 0.7}, 359) == 0.7

    def test_after_last_entry(self):
        assert _value_in_force(REPORTER_BASAL, 1439) == 0.7


class TestTargetInForce:
    def test_midpoint_of_bounds_in_force(self):
        assert _target_in_force({0: 80.0}, {0: 120.0}, 600) == 100
        # 102.5 -> 102 (round half to even); pinned so a change is visible.
        assert _target_in_force({0: 90.0}, {0: 115.0}, 0) == 102

    def test_equal_bounds_are_the_profile_target(self):
        assert _target_in_force({0: 100.0}, {0: 100.0}, 0) == 100

    def test_carries_forward_and_wraps(self):
        low = {360: 100.0, 1320: 120.0}
        high = {360: 100.0, 1320: 120.0}
        assert _target_in_force(low, high, 480) == 100
        assert _target_in_force(low, high, 0) == 120

    def test_missing_schedule_is_sentinel(self):
        assert _target_in_force({}, {0: 120.0}, 0) == 0
        assert _target_in_force({0: 80.0}, {}, 0) == 0

    def test_inverted_bounds_are_sentinel(self):
        assert _target_in_force({0: 130.0}, {0: 120.0}, 0) == 0

    def test_outside_glucose_range_is_sentinel(self):
        # e.g. an mmol profile mislabelled as mg/dL: drop, don't clamp.
        assert _target_in_force({0: 5.0}, {0: 6.0}, 0) == 0
        assert _target_in_force({0: 600.0}, {0: 700.0}, 0) == 0


class TestTargetScheduleByStart:
    def test_mgdl_values_pass_through(self):
        raw = [{"time": "00:00", "value": 100}, {"time": "22:00", "value": 120}]
        assert _target_schedule_by_start(raw, is_mmol=False) == {
            0: 100.0,
            1320: 120.0,
        }

    def test_mmol_values_convert_to_mgdl(self):
        raw = [{"time": "00:00", "value": 5.5}]
        assert _target_schedule_by_start(raw, is_mmol=True) == {0: 99.1}

    def test_missing_schedule_is_empty(self):
        assert _target_schedule_by_start(None, is_mmol=False) == {}


class TestMergeSegments:
    def test_reporter_case_carries_real_values(self):
        segments = _merge_segments(
            basal_by_start=REPORTER_BASAL,
            carb_ratio_by_start=REPORTER_CARB_RATIO,
            isf_by_start=REPORTER_ISF,
        )

        assert [s["start_minutes"] for s in segments] == [0, 360, 480, 600]
        by_start = {s["start_minutes"]: s for s in segments}
        # 08:00 exists only in the carb-ratio schedule: basal and ISF
        # carry the values in force at 08:00.
        assert by_start[480]["basal_rate"] == 0.8
        assert by_start[480]["correction_factor"] == 50.0
        assert by_start[480]["carb_ratio"] == 12.0
        # 06:00 and 10:00 exist only in basal: carb ratio carries 10.0.
        assert by_start[360]["carb_ratio"] == 10.0
        assert by_start[600]["carb_ratio"] == 12.0
        for seg in segments:
            assert seg["basal_rate"] > 0
            assert seg["correction_factor"] > 0
            assert seg["carb_ratio"] > 0

    def test_reporter_case_prompt_has_no_zero_values(self):
        segments = _merge_segments(
            basal_by_start=REPORTER_BASAL,
            carb_ratio_by_start=REPORTER_CARB_RATIO,
            isf_by_start=REPORTER_ISF,
            target_low_by_start={0: 80.0},
            target_high_by_start={0: 120.0},
        )
        text = format_pump_profile_for_prompt(_to_summary(segments))

        _assert_no_unknowns_rendered(text)
        assert (
            "- 8:00 AM: Basal 0.800 u/hr, CF 1:50.0, CR 1:12, Target 100 mg/dL" in text
        )

    def test_wrap_around_first_breakpoint_after_midnight(self):
        """Basal starts at 06:00; at the 00:00 ISF breakpoint the previous
        day's last basal entry is still in force."""
        segments = _merge_segments(
            basal_by_start={360: 0.8, 1320: 0.5},
            carb_ratio_by_start={},
            isf_by_start={0: 45.0},
        )

        by_start = {s["start_minutes"]: s for s in segments}
        assert by_start[0]["basal_rate"] == 0.5
        assert by_start[360]["basal_rate"] == 0.8
        assert by_start[1320]["correction_factor"] == 45.0

    def test_domain_not_imported_stays_sentinel(self):
        segments = _merge_segments(
            basal_by_start=REPORTER_BASAL,
            carb_ratio_by_start={},
            isf_by_start=REPORTER_ISF,
        )

        for seg in segments:
            assert seg["carb_ratio"] == 0.0
            assert seg["basal_rate"] > 0
            assert seg["correction_factor"] == 50.0
            assert seg["target_bg"] == 0

    def test_target_follows_its_own_schedule(self):
        """A target of 100 by day and 120 overnight stays per-segment; it
        is never collapsed into one invented value such as 110."""
        segments = _merge_segments(
            basal_by_start=REPORTER_BASAL,
            carb_ratio_by_start=REPORTER_CARB_RATIO,
            isf_by_start=REPORTER_ISF,
            target_low_by_start={0: 120.0, 360: 100.0, 1320: 120.0},
            target_high_by_start={0: 120.0, 360: 100.0, 1320: 120.0},
        )

        by_start = {s["start_minutes"]: s for s in segments}
        # The 22:00 target breakpoint joins the union.
        assert sorted(by_start) == [0, 360, 480, 600, 1320]
        assert by_start[0]["target_bg"] == 120
        assert by_start[480]["target_bg"] == 100
        assert by_start[600]["target_bg"] == 100
        assert by_start[1320]["target_bg"] == 120
        assert by_start[1320]["basal_rate"] == 0.7

    def test_one_target_bound_keeps_sentinel(self):
        segments = _merge_segments(
            basal_by_start=REPORTER_BASAL,
            carb_ratio_by_start=REPORTER_CARB_RATIO,
            isf_by_start=REPORTER_ISF,
            target_low_by_start={0: 80.0, 720: 90.0},
            target_high_by_start={},
        )

        assert [s["start_minutes"] for s in segments] == [0, 360, 480, 600]
        assert {s["target_bg"] for s in segments} == {0}


def _schedule(
    field: str, values: dict[int, float]
) -> OnboardingScheduleFieldDerivation:
    return OnboardingScheduleFieldDerivation(
        field=field,
        proposed_segments=[
            OnboardingScheduleSegment(start_minutes=start, value=value)
            for start, value in values.items()
        ],
    )


def _derivation() -> OnboardingDerivation:
    return OnboardingDerivation(
        has_profile=True,
        target_low=OnboardingNumericFieldDerivation(
            field="target_low", proposed_value=80.0
        ),
        target_high=OnboardingNumericFieldDerivation(
            field="target_high", proposed_value=120.0
        ),
        dia_hours=OnboardingNumericFieldDerivation(field="dia_hours"),
        basal_schedule=_schedule("basal_schedule", REPORTER_BASAL),
        carb_ratio_schedule=_schedule("carb_ratio_schedule", REPORTER_CARB_RATIO),
        isf_schedule=_schedule("isf_schedule", REPORTER_ISF),
    )


def _mock_db() -> AsyncMock:
    db = AsyncMock()
    db.execute = AsyncMock(return_value=MagicMock())
    return db


def _written_segments(db: AsyncMock) -> list[dict]:
    # The UPSERT is the first execute; the second re-reads the row.
    insert_stmt = db.execute.call_args_list[0].args[0]
    return insert_stmt.compile().params["segments"]


class TestUpsertFromOnboarding:
    @pytest.mark.asyncio
    async def test_writes_carried_forward_segments_with_target(self):
        db = _mock_db()

        await upsert_from_onboarding(
            uuid.uuid4(),
            _derivation(),
            apply_basal=True,
            apply_carb_ratio=True,
            apply_isf=True,
            apply_dia=False,
            db=db,
            target_low_segments=[{"time": "00:00", "value": 80}],
            target_high_segments=[{"time": "00:00", "value": 120}],
        )

        segments = _written_segments(db)
        by_start = {s["start_minutes"]: s for s in segments}
        assert by_start[480]["basal_rate"] == 0.8
        assert by_start[480]["correction_factor"] == 50.0
        assert {s["target_bg"] for s in segments} == {100}

    @pytest.mark.asyncio
    async def test_mmol_target_converted_to_mgdl(self):
        db = _mock_db()
        derivation = _derivation().model_copy(update={"units_converted": True})

        await upsert_from_onboarding(
            uuid.uuid4(),
            derivation,
            apply_basal=True,
            apply_carb_ratio=False,
            apply_isf=False,
            apply_dia=False,
            db=db,
            target_low_segments=[{"time": "00:00", "value": 5.5}],
            target_high_segments=[{"time": "00:00", "value": 5.5}],
        )

        assert {s["target_bg"] for s in _written_segments(db)} == {99}

    @pytest.mark.asyncio
    async def test_no_target_keeps_sentinel(self):
        db = _mock_db()

        await upsert_from_onboarding(
            uuid.uuid4(),
            _derivation(),
            apply_basal=True,
            apply_carb_ratio=True,
            apply_isf=True,
            apply_dia=False,
            db=db,
        )

        assert {s["target_bg"] for s in _written_segments(db)} == {0}

    @pytest.mark.asyncio
    async def test_unimported_domain_stays_sentinel(self):
        db = _mock_db()

        await upsert_from_onboarding(
            uuid.uuid4(),
            _derivation(),
            apply_basal=True,
            apply_carb_ratio=False,
            apply_isf=True,
            apply_dia=False,
            db=db,
        )

        segments = _written_segments(db)
        assert [s["start_minutes"] for s in segments] == [0, 360, 600]
        assert {s["carb_ratio"] for s in segments} == {0.0}

    @pytest.mark.asyncio
    async def test_target_alone_creates_no_profile(self):
        db = _mock_db()

        result = await upsert_from_onboarding(
            uuid.uuid4(),
            _derivation(),
            apply_basal=False,
            apply_carb_ratio=False,
            apply_isf=False,
            apply_dia=False,
            db=db,
            target_low_segments=[{"time": "00:00", "value": 80}],
            target_high_segments=[{"time": "00:00", "value": 120}],
        )

        assert result is None
        db.execute.assert_not_called()
