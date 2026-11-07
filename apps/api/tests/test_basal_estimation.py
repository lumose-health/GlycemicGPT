"""Tests for the shared temp-basal/profile delivery estimate."""

from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo

import pytest

from src.models.pump_profile import SEGMENT_UNKNOWN_AS_NULL_KEY
from src.services.basal_estimation import BasalEvent, estimate_basal_delivery


def _segment(start_minutes: int, rate: float | None) -> dict:
    return {
        "start_minutes": start_minutes,
        "basal_rate": rate,
        SEGMENT_UNKNOWN_AS_NULL_KEY: True,
    }


def test_temp_duration_uses_scheduled_rate_for_uncovered_time():
    start = datetime(2026, 1, 1, 10, tzinfo=UTC)
    end = start + timedelta(minutes=40)

    estimate = estimate_basal_delivery(
        [
            BasalEvent(start, rate=3.0, duration_minutes=2),
            BasalEvent(end, rate=1.0),
        ],
        start,
        end,
        profile_segments=[_segment(0, 0.8)],
        legacy_max_gap_hours=2.0,
    )

    assert estimate.complete is True
    assert estimate.units == pytest.approx(0.6066666667)


@pytest.mark.parametrize("profile_segments", [None, [], [_segment(0, None)]])
def test_unknown_scheduled_rate_is_not_treated_as_zero(profile_segments):
    start = datetime(2026, 1, 1, 10, tzinfo=UTC)
    end = start + timedelta(minutes=40)

    estimate = estimate_basal_delivery(
        [BasalEvent(start, rate=3.0, duration_minutes=2)],
        start,
        end,
        profile_segments=profile_segments,
        legacy_max_gap_hours=2.0,
    )

    assert estimate.complete is False
    assert estimate.units == pytest.approx(0.1)


def test_real_zero_scheduled_window_is_known_zero():
    start = datetime(2026, 1, 1, 10, tzinfo=UTC)
    end = start + timedelta(minutes=40)

    estimate = estimate_basal_delivery(
        [BasalEvent(start, rate=3.0, duration_minutes=2)],
        start,
        end,
        profile_segments=[_segment(0, 0.0)],
        legacy_max_gap_hours=2.0,
    )

    assert estimate.complete is True
    assert estimate.units == pytest.approx(0.1)


def test_scheduled_rate_changes_inside_uncovered_time():
    start = datetime(2026, 1, 1, 9, 50, tzinfo=UTC)
    end = start + timedelta(minutes=20)

    estimate = estimate_basal_delivery(
        [BasalEvent(start, rate=3.0, duration_minutes=2)],
        start,
        end,
        profile_segments=[_segment(0, 0.5), _segment(10 * 60, 1.0)],
        legacy_max_gap_hours=2.0,
    )

    # 2 min at 3.0 + 8 min at 0.5 + 10 min at 1.0.
    assert estimate.complete is True
    assert estimate.units == pytest.approx(1 / 3)


def test_scheduled_fill_uses_full_uncovered_interval():
    start = datetime(2026, 1, 1, 10, tzinfo=UTC)
    end = start + timedelta(hours=6)

    estimate = estimate_basal_delivery(
        [BasalEvent(start, rate=3.0, duration_minutes=2)],
        start,
        end,
        profile_segments=[_segment(0, 0.8)],
        legacy_max_gap_hours=2.0,
    )

    # The legacy cap applies only to durationless event rates. A known profile
    # schedule fills all 5 h 58 min after the temp ends.
    assert estimate.complete is True
    assert estimate.units == pytest.approx(4.8733333333)


def test_out_of_range_scheduled_rate_is_unknown_not_clamped():
    start = datetime(2026, 1, 1, 10, tzinfo=UTC)
    end = start + timedelta(minutes=40)

    estimate = estimate_basal_delivery(
        [BasalEvent(start, rate=3.0, duration_minutes=2)],
        start,
        end,
        profile_segments=[_segment(0, 1000.0)],
        legacy_max_gap_hours=2.0,
    )

    assert estimate.complete is False
    assert estimate.units == pytest.approx(0.1)


@pytest.mark.parametrize("durations", [(30, 2), (2, 30)])
def test_same_timestamp_events_prefer_shorter_duration(durations):
    start = datetime(2026, 1, 1, 10, tzinfo=UTC)
    end = start + timedelta(minutes=40)

    estimate = estimate_basal_delivery(
        [
            *(BasalEvent(start, rate=3.0, duration_minutes=d) for d in durations),
            BasalEvent(end, rate=1.0),
        ],
        start,
        end,
        profile_segments=[_segment(0, 0.8)],
        legacy_max_gap_hours=2.0,
    )

    assert estimate.complete is True
    assert estimate.units == pytest.approx(0.6066666667)


def test_durationless_source_keeps_legacy_result():
    start = datetime(2026, 1, 1, 10, tzinfo=UTC)
    end = start + timedelta(minutes=40)

    estimate = estimate_basal_delivery(
        [BasalEvent(start, rate=3.0)],
        start,
        end,
        profile_segments=[_segment(0, 0.8)],
        legacy_max_gap_hours=2.0,
    )

    assert estimate.complete is True
    assert estimate.units == pytest.approx(2.0)


def test_profile_lookup_uses_local_time_of_day():
    # 15:00 UTC is 10:00 in New York in January. The UTC schedule rate is
    # deliberately different so this catches UTC-clock profile lookups.
    start = datetime(2026, 1, 1, 15, tzinfo=UTC)
    end = start + timedelta(minutes=40)

    estimate = estimate_basal_delivery(
        [BasalEvent(start, rate=3.0, duration_minutes=2)],
        start,
        end,
        profile_segments=[_segment(0, 2.0), _segment(10 * 60, 0.8)],
        profile_timezone=ZoneInfo("America/New_York"),
        legacy_max_gap_hours=2.0,
    )

    assert estimate.complete is True
    assert estimate.units == pytest.approx(0.6066666667)


def test_profile_change_in_spring_forward_gap_uses_transition_instant():
    zone = ZoneInfo("America/New_York")
    start = datetime(2026, 3, 8, 6, 50, tzinfo=UTC)  # 01:50 local
    end = datetime(2026, 3, 8, 7, 10, tzinfo=UTC)  # 03:10 local

    estimate = estimate_basal_delivery(
        [BasalEvent(start, rate=3.0, duration_minutes=2)],
        start,
        end,
        profile_segments=[_segment(0, 0.5), _segment(2 * 60 + 30, 1.0)],
        profile_timezone=zone,
        legacy_max_gap_hours=2.0,
    )

    # 2 min at 3.0, 8 min at 0.5, then 10 min at 1.0 from the 03:00 jump.
    assert estimate.complete is True
    assert estimate.units == pytest.approx(1 / 3)


def test_scheduled_fill_splits_at_fall_back_transition():
    zone = ZoneInfo("America/New_York")
    start = datetime(2026, 11, 1, 5, 30, tzinfo=UTC)  # 01:30 EDT
    end = datetime(2026, 11, 1, 6, 30, tzinfo=UTC)  # 01:30 EST

    estimate = estimate_basal_delivery(
        [BasalEvent(start, rate=1.0, duration_minutes=0)],
        start,
        end,
        profile_segments=[_segment(0, 0.5), _segment(90, 1.0)],
        profile_timezone=zone,
        legacy_max_gap_hours=2.0,
    )

    # 30 min at the 01:30 EDT rate, then 30 min at the repeated 01:00 rate.
    assert estimate.complete is True
    assert estimate.units == pytest.approx(0.75)
