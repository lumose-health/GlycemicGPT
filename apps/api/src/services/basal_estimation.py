"""Shared basal-delivery estimation from pump events and profile schedules."""

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo

from src.models.pump_profile import known_segment_values

# Maximum supported pump basal rate (Tandem X2/Mobi max = 15 U/hr). Read paths
# use this as a corrupt-record ceiling; scheduled rates above it are unknown,
# never clamped to a plausible dose.
MAX_BASAL_RATE = 15.0


@dataclass(frozen=True)
class BasalEvent:
    """A basal-rate event as stored in ``pump_events``."""

    timestamp: datetime
    rate: float
    duration_minutes: int | None = None


@dataclass(frozen=True)
class BasalEstimate:
    """Known basal units and whether every explicit-temp gap was estimable."""

    units: float
    complete: bool


def _utc(ts: datetime) -> datetime:
    return ts.replace(tzinfo=UTC) if ts.tzinfo is None else ts.astimezone(UTC)


def _profile_schedule(
    segments: list[dict[str, object]] | None,
) -> list[tuple[int, float | None]]:
    """Normalize profile segments while preserving unknown versus real zero."""
    by_start: dict[int, float | None] = {}
    for segment in segments or []:
        if not isinstance(segment, dict):
            continue
        start = segment.get("start_minutes")
        if (
            isinstance(start, bool)
            or not isinstance(start, int)
            or not 0 <= start < 1440
        ):
            continue
        rate = known_segment_values(segment)["basal_rate"]
        by_start[start] = rate if rate is None or rate <= MAX_BASAL_RATE else None
    return sorted(by_start.items())


def _rate_at(
    schedule: list[tuple[int, float | None]], ts: datetime, zone: ZoneInfo
) -> float | None:
    if not schedule:
        return None
    local = ts.astimezone(zone)
    minute = local.hour * 60 + local.minute
    active = schedule[-1][1]
    for start, rate in schedule:
        if start > minute:
            break
        active = rate
    return active


def _profile_boundaries(
    start: datetime,
    end: datetime,
    schedule: list[tuple[int, float | None]],
    zone: ZoneInfo,
) -> list[datetime]:
    """Return UTC instants where the local profile may change.

    Both folds are considered on a fall-back day. A profile change inside a
    spring-forward gap takes effect at the transition instant.
    """
    if not schedule:
        return []
    first_day = start.astimezone(zone).date() - timedelta(days=1)
    last_day = end.astimezone(zone).date() + timedelta(days=1)
    candidates: set[datetime] = set()
    day = first_day
    while day <= last_day:
        for minute, _ in schedule:
            hour, minute_of_hour = divmod(minute, 60)
            wall_time = datetime(
                day.year,
                day.month,
                day.day,
                hour,
                minute_of_hour,
            )
            fold_candidates: list[datetime] = []
            valid_candidates: list[datetime] = []
            for fold in (0, 1):
                local = wall_time.replace(tzinfo=zone, fold=fold)
                utc_candidate = local.astimezone(UTC)
                fold_candidates.append(utc_candidate)
                round_trip = utc_candidate.astimezone(zone)
                if (
                    round_trip.date() == day
                    and round_trip.hour == hour
                    and round_trip.minute == minute_of_hour
                    and round_trip.fold == fold
                ):
                    valid_candidates.append(utc_candidate)

            if not valid_candidates and fold_candidates[0] != fold_candidates[1]:
                lower, upper = sorted(fold_candidates)
                while upper - lower > timedelta(seconds=1):
                    midpoint = lower + (upper - lower) / 2
                    midpoint_wall = midpoint.astimezone(zone).replace(tzinfo=None)
                    if midpoint_wall >= wall_time:
                        upper = midpoint
                    else:
                        lower = midpoint
                valid_candidates.append(upper)

            candidates.update(
                candidate for candidate in valid_candidates if start < candidate < end
            )
        day += timedelta(days=1)
    return sorted(candidates)


def _timezone_boundaries(
    start: datetime,
    end: datetime,
    zone: ZoneInfo,
) -> list[datetime]:
    """Return UTC instants where the zone's UTC offset changes."""
    boundaries: list[datetime] = []
    left = start
    left_offset = left.astimezone(zone).utcoffset()
    while left < end:
        right = min(left + timedelta(hours=1), end)
        right_offset = right.astimezone(zone).utcoffset()
        if right_offset != left_offset:
            lower = left
            upper = right
            while upper - lower > timedelta(microseconds=1):
                midpoint = lower + (upper - lower) / 2
                if midpoint.astimezone(zone).utcoffset() == left_offset:
                    lower = midpoint
                else:
                    upper = midpoint
            if start < upper < end:
                boundaries.append(upper)
        left = right
        left_offset = right_offset
    return boundaries


def _scheduled_units(
    start: datetime,
    end: datetime,
    schedule: list[tuple[int, float | None]],
    zone: ZoneInfo,
) -> BasalEstimate:
    if end <= start:
        return BasalEstimate(0.0, True)
    points = sorted(
        {
            start,
            *_profile_boundaries(start, end, schedule, zone),
            *_timezone_boundaries(start, end, zone),
            end,
        }
    )
    units = 0.0
    complete = True
    for left, right in zip(points, points[1:], strict=False):
        rate = _rate_at(schedule, left, zone)
        if rate is None:
            complete = False
            continue
        units += rate * (right - left).total_seconds() / 3600.0
    return BasalEstimate(units, complete)


def estimate_basal_delivery(
    events: list[BasalEvent],
    period_start: datetime,
    period_end: datetime,
    *,
    profile_segments: list[dict[str, object]] | None = None,
    profile_timezone: ZoneInfo | None = None,
    legacy_max_gap_hours: float,
) -> BasalEstimate:
    """Estimate basal delivery for a reporting window.

    Events with no explicit duration keep the legacy calculation: their rate
    runs until the next event, capped at ``legacy_max_gap_hours``. An event
    with a duration contributes only through the earlier of its duration or
    the next event; any remaining time before that next event is filled from
    the active profile. Missing/unknown scheduled rates leave the numeric
    result partial and set ``complete`` false instead of treating unknown as
    zero. A real scheduled 0 U/h remains a known zero.
    """
    start = _utc(period_start)
    end = _utc(period_end)
    if end <= start:
        return BasalEstimate(0.0, True)

    ordered_with_duplicates = sorted(
        (
            BasalEvent(_utc(event.timestamp), float(event.rate), event.duration_minutes)
            for event in events
        ),
        key=lambda event: event.timestamp,
    )
    ordered: list[BasalEvent] = []
    for event in ordered_with_duplicates:
        if not ordered or ordered[-1].timestamp != event.timestamp:
            ordered.append(event)
            continue

        current = ordered[-1]
        current_duration = current.duration_minutes
        event_duration = event.duration_minutes
        if event_duration is not None and (
            current_duration is None or event_duration <= current_duration
        ):
            ordered[-1] = event
    schedule = _profile_schedule(profile_segments)
    zone = profile_timezone or ZoneInfo("UTC")
    units = 0.0
    complete = True

    for index, event in enumerate(ordered):
        interval_start = max(event.timestamp, start)
        next_timestamp = (
            ordered[index + 1].timestamp if index + 1 < len(ordered) else end
        )
        interval_end = min(next_timestamp, end)
        if interval_end <= interval_start:
            continue

        if event.duration_minutes is None:
            delivery_end = min(
                interval_end,
                interval_start + timedelta(hours=legacy_max_gap_hours),
            )
            units += (
                event.rate * (delivery_end - interval_start).total_seconds() / 3600.0
            )
            continue

        duration_minutes = max(event.duration_minutes, 0)
        delivery_end = min(
            interval_end,
            event.timestamp + timedelta(minutes=duration_minutes),
        )
        if delivery_end > interval_start:
            units += (
                event.rate * (delivery_end - interval_start).total_seconds() / 3600.0
            )

        scheduled_start = max(delivery_end, interval_start)
        scheduled = _scheduled_units(scheduled_start, interval_end, schedule, zone)
        units += scheduled.units
        complete = complete and scheduled.complete

    return BasalEstimate(units, complete)
