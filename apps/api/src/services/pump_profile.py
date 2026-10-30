"""Pump profile service."""

import uuid
from bisect import bisect_right
from datetime import UTC, datetime

from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.treatment_safety.models import MAX_GLUCOSE_MGDL, MIN_GLUCOSE_MGDL
from src.models.pump_profile import PumpProfile
from src.schemas.nightscout import OnboardingDerivation, OnboardingScheduleSegment
from src.services.integrations.nightscout.onboarding_derive import (
    _mmol_to_mgdl_per_unit,
    _segments_to_canonical,
)

# Stable name for profiles imported from a Nightscout connection.
# Distinct from the "Tandem" name used by `tandem_sync.py` so the two
# integrations cannot collide on `uq_pump_profile_user_name` and so a
# user with both connections sees both rows in their profile history.
# The active-profile reader (`get_active_profile`) tie-breaks across
# names by `synced_at desc`, so the most recently synced source wins.
NIGHTSCOUT_PROFILE_NAME = "Nightscout"


async def get_active_profile(
    user_id: uuid.UUID,
    db: AsyncSession,
) -> PumpProfile | None:
    """Get the user's most recently synced active pump profile."""
    result = await db.execute(
        select(PumpProfile)
        .where(PumpProfile.user_id == user_id, PumpProfile.is_active.is_(True))
        .order_by(PumpProfile.synced_at.desc())
        .limit(1)
    )
    return result.scalar_one_or_none()


def _format_time_label(start_minutes: int) -> str:
    """Render `start_minutes` as a 12-hour clock label, e.g. "6:30 AM"."""
    hours = start_minutes // 60
    minutes = start_minutes % 60
    period = "AM" if hours < 12 else "PM"
    display_hour = hours % 12 or 12
    return f"{display_hour}:{minutes:02d} {period}"


def _segments_by_start(
    segments: list[OnboardingScheduleSegment] | None,
) -> dict[int, float]:
    """Index a derivation's segment list by `start_minutes`.

    Returns an empty map when no segments were proposed (None or
    empty list) so callers can treat "missing schedule" and "no
    schedule segments" identically.
    """
    if not segments:
        return {}
    return {seg.start_minutes: seg.value for seg in segments}


def _value_in_force(by_start: dict[int, float], minute: int) -> float:
    """Return the schedule value in force at `minute`.

    A schedule entry holds from its start until the next entry. Before
    the first entry of the day the previous day's last entry is still
    in force, so a schedule whose first entry starts after 00:00 wraps
    (the Loop / AAPS convention noted in `_segments_to_canonical`).
    Returns the 0.0 sentinel when the schedule is empty (not imported).
    """
    if not by_start:
        return 0.0
    starts = sorted(by_start)
    # Index -1 (minute before the first start) is the midnight wrap.
    return float(by_start[starts[bisect_right(starts, minute) - 1]])


def _target_in_force(
    target_low_by_start: dict[int, float],
    target_high_by_start: dict[int, float],
    minute: int,
) -> int:
    """Collapse the low/high targets in force at `minute` into `target_bg`.

    The segment shape has one `target_bg` field, so the midpoint of the
    low and high targets in force is stored, rounded to a whole mg/dL.
    Loop and AAPS profiles usually set low == high, in which case this
    is the profile's own target. Returns the 0 sentinel when either
    schedule is empty, either bound falls outside the 20-500 mg/dL
    glucose range (drop, don't clamp; this also rejects NaN and inf),
    or the bounds are inverted.
    """
    low = _value_in_force(target_low_by_start, minute)
    high = _value_in_force(target_high_by_start, minute)
    for bound in (low, high):
        if not MIN_GLUCOSE_MGDL <= bound <= MAX_GLUCOSE_MGDL:
            return 0
    if low > high:
        return 0
    return round((low + high) / 2)


def _target_schedule_by_start(
    raw_segments: list[dict] | None,
    *,
    is_mmol: bool,
) -> dict[int, float]:
    """Parse a raw Nightscout target schedule into a mg/dL start map,
    converting mmol/L the same way the onboarding derivation does.

    A schedule that fails segment validation (e.g. a "NaN" value from
    upstream) is treated as not imported rather than failing the apply.
    """
    try:
        segments = _segments_to_canonical(
            raw_segments,
            value_transform=_mmol_to_mgdl_per_unit if is_mmol else None,
        )
    except ValidationError:
        return {}
    return _segments_by_start(segments)


def _merge_segments(
    *,
    basal_by_start: dict[int, float],
    carb_ratio_by_start: dict[int, float],
    isf_by_start: dict[int, float],
    target_low_by_start: dict[int, float] | None = None,
    target_high_by_start: dict[int, float] | None = None,
) -> list[dict]:
    """Merge per-domain schedule maps into the canonical segment list.

    The pump_profiles JSONB shape co-locates basal_rate /
    correction_factor / carb_ratio / target_bg per time slot, but
    Nightscout exposes them as independent schedules with
    independent breakpoints. We take the UNION of breakpoints
    across whichever schedules the caller opted to import. At a
    breakpoint a schedule doesn't define, that schedule's value in
    force at that time is carried forward (see `_value_in_force`),
    the way Nightscout reads a profile.

    When both target schedules are given, their breakpoints join the
    union and each segment's `target_bg` is the mg/dL target in force
    there (see `_target_in_force`).

    Zero is a sentinel for "this domain wasn't imported" rather
    than a real basal/ICR/ISF/target_bg value (those are all
    `gt=0` in the derivation schema). It only appears for a domain
    the caller didn't import (or a missing target), never for a
    gap between breakpoints. Downstream readers must not
    treat 0 as a valid pump setting -- the active profile is a
    UI/AI surface, not a delivery target on this monitoring-only
    project. This matches the convention already used by the
    Tandem writer in `tandem_sync.py`.

    `correction_factor` (ISF) is stored as a float to preserve
    fractional values from Nightscout (e.g. mmol-converted ISFs
    that round to non-integer mg/dL/U). Mobile readers must accept
    either int or float -- the JSONB column is untyped per-field
    by design.
    """
    target_low = target_low_by_start or {}
    target_high = target_high_by_start or {}
    breakpoints = set(basal_by_start) | set(carb_ratio_by_start) | set(isf_by_start)
    if target_low and target_high:
        breakpoints |= set(target_low) | set(target_high)
    # Cover 00:00 with the values wrapped from the previous day when
    # every schedule starts later, so the list spans the whole day.
    if breakpoints:
        breakpoints.add(0)
    out: list[dict] = []
    for start in sorted(breakpoints):
        out.append(
            {
                "time": _format_time_label(start),
                "start_minutes": start,
                "basal_rate": _value_in_force(basal_by_start, start),
                "correction_factor": _value_in_force(isf_by_start, start),
                "carb_ratio": _value_in_force(carb_ratio_by_start, start),
                "target_bg": _target_in_force(target_low, target_high, start),
            }
        )
    return out


async def upsert_from_onboarding(
    user_id: uuid.UUID,
    derivation: OnboardingDerivation,
    *,
    apply_basal: bool,
    apply_carb_ratio: bool,
    apply_isf: bool,
    apply_dia: bool,
    db: AsyncSession,
    target_low_segments: list[dict] | None = None,
    target_high_segments: list[dict] | None = None,
) -> PumpProfile | None:
    """Persist a Nightscout-imported pump profile for the user.

    Returns the upserted row, or None when nothing was actually
    applied (all flags false, or all opted-in schedules empty AND
    DIA not opted in / unavailable). The connection's confirmed
    DIA writes to `insulin_configs` separately by the caller; the
    DIA value here is mirrored onto `insulin_duration_min` only so
    the active-profile reader surfaces a coherent value to mobile
    clients alongside the schedule segments.

    Idempotent: re-running with the same derivation yields the
    same row state. UPSERTs by `(user_id, profile_name)` so a user
    re-running the wizard refreshes their existing Nightscout
    profile in place rather than accumulating duplicates.

    `is_active=True` on every write: the cross-source tie-break
    is `synced_at desc` (see `get_active_profile`), so a fresh
    Tandem sync after a Nightscout import will retake priority
    naturally without needing to flip flags here.

    `target_low_segments` / `target_high_segments` are the raw
    Nightscout target schedules from the same profile snapshot (None
    when the caller didn't import targets), in the profile's units;
    `derivation.units_converted` drives the mmol -> mg/dL conversion.
    With both present each segment carries the target in force at
    its start; otherwise `target_bg` stays the 0 sentinel. Targets
    alone never create a profile row.
    """
    basal_map = (
        _segments_by_start(derivation.basal_schedule.proposed_segments)
        if apply_basal
        else {}
    )
    carb_map = (
        _segments_by_start(derivation.carb_ratio_schedule.proposed_segments)
        if apply_carb_ratio
        else {}
    )
    isf_map = (
        _segments_by_start(derivation.isf_schedule.proposed_segments)
        if apply_isf
        else {}
    )

    dia_value = derivation.dia_hours.proposed_value if apply_dia else None
    dia_minutes: int | None = (
        int(round(dia_value * 60)) if dia_value is not None and dia_value > 0 else None
    )

    if not basal_map and not carb_map and not isf_map and dia_minutes is None:
        return None

    is_mmol = derivation.units_converted
    segments = _merge_segments(
        basal_by_start=basal_map,
        carb_ratio_by_start=carb_map,
        isf_by_start=isf_map,
        target_low_by_start=_target_schedule_by_start(
            target_low_segments, is_mmol=is_mmol
        ),
        target_high_by_start=_target_schedule_by_start(
            target_high_segments, is_mmol=is_mmol
        ),
    )

    now = datetime.now(UTC)

    stmt = (
        insert(PumpProfile)
        .values(
            id=uuid.uuid4(),
            user_id=user_id,
            profile_name=NIGHTSCOUT_PROFILE_NAME,
            is_active=True,
            segments=segments,
            insulin_duration_min=dia_minutes,
            carb_entry_enabled=True,
            max_bolus_units=None,
            cgm_high_alert_mgdl=None,
            cgm_low_alert_mgdl=None,
            synced_at=now,
        )
        .on_conflict_do_update(
            constraint="uq_pump_profile_user_name",
            set_={
                "is_active": True,
                "segments": segments,
                "insulin_duration_min": dia_minutes,
                "carb_entry_enabled": True,
                "synced_at": now,
            },
        )
    )
    await db.execute(stmt)
    await db.flush()

    result = await db.execute(
        select(PumpProfile).where(
            PumpProfile.user_id == user_id,
            PumpProfile.profile_name == NIGHTSCOUT_PROFILE_NAME,
        )
    )
    return result.scalar_one()
