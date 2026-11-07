"""Map Nightscout entries + BG-Check treatments to GlucoseReading rows.

Produces dicts ready for `INSERT ... ON CONFLICT DO NOTHING` upsert
keyed on `(source, ns_id)`. The mappers are pure -- the orchestrator
handles DB writes.

Two distinct input paths land in `glucose_readings`:

- `entries[type=sgv]` -- CGM readings (most common path)
- `entries[type=mbg]` -- xDrip+ Android fingerstick (entries-route)
- `treatments[eventType=BG Check or glucoseType=Finger]` -- xDrip4iOS
  / Care Portal fingerstick (treatments-route)

The two fingerstick paths are the dual-path documented in the
translator survey: same logical event, different collection. Both
land in the same table with `trend = NOT_COMPUTABLE` (fingersticks
have no trend).
"""

from __future__ import annotations

import math
from datetime import UTC, datetime
from typing import Any

from src.core.units import MGDL_PER_MMOL
from src.models.glucose import TrendDirection
from src.services.integrations.nightscout._treatment_units import (
    resolve_treatment_glucose_units,
)
from src.services.integrations.nightscout.models import (
    NightscoutEntry,
    NightscoutTreatment,
)

# Nightscout direction strings (canonical wire form, spaced) ->
# TrendDirection enum. NightscoutEntry's validator already normalizes
# the underscored variants to spaced form.
_NS_DIRECTION_TO_TREND: dict[str, TrendDirection] = {
    "DoubleUp": TrendDirection.DOUBLE_UP,
    "SingleUp": TrendDirection.SINGLE_UP,
    "FortyFiveUp": TrendDirection.FORTY_FIVE_UP,
    "Flat": TrendDirection.FLAT,
    "FortyFiveDown": TrendDirection.FORTY_FIVE_DOWN,
    "SingleDown": TrendDirection.SINGLE_DOWN,
    "DoubleDown": TrendDirection.DOUBLE_DOWN,
    "NOT COMPUTABLE": TrendDirection.NOT_COMPUTABLE,
    "RATE OUT OF RANGE": TrendDirection.RATE_OUT_OF_RANGE,
    "NONE": TrendDirection.NOT_COMPUTABLE,
    # Trio extends with TripleUp/TripleDown outside the canonical
    # NS enum. Coerce to the closest documented value rather than
    # rejecting -- losing the "triple" granularity is acceptable.
    "TripleUp": TrendDirection.DOUBLE_UP,
    "TripleDown": TrendDirection.DOUBLE_DOWN,
}


def map_ns_direction(direction: str | None) -> TrendDirection:
    """Resolve a Nightscout `direction` string to a TrendDirection enum.

    Unknown / missing direction strings fall back to NOT_COMPUTABLE
    rather than raising -- some uploaders omit the field entirely or
    emit values outside the documented enum.
    """
    if direction is None:
        return TrendDirection.NOT_COMPUTABLE
    return _NS_DIRECTION_TO_TREND.get(direction, TrendDirection.NOT_COMPUTABLE)


def map_entry_to_glucose_reading(
    entry: NightscoutEntry,
    *,
    user_id: str,
    source: str,
    received_at: datetime | None = None,
) -> dict[str, Any] | None:
    """Map a Nightscout entry to a GlucoseReading insert dict.

    Returns None when the entry should be dropped:
    - `cal` records (calibration metadata, not a reading)
    - SGV-type readings outside the medically valid range (gap rule)
    - Missing canonical timestamp

    Otherwise returns a dict with keys matching `GlucoseReading`
    columns, suitable for `Insert(GlucoseReading.__table__).values(...)`.

    Unit invariant: the Nightscout entries schema has no per-record unit field,
    and Nightscout always serves entries -- both `sgv` (CGM) and `mbg` (manual
    BG) -- as mg/dL on the wire. Both branches therefore store the value as-is
    with no unit conversion; this is the canonical-mg/dL guarantee for the
    entries route. (The BG-Check *treatments* route is the only NS path that
    carries an optional `units` field and converts mmol/L --
    see `map_bg_check_treatment_to_glucose_reading`.)
    """
    timestamp = entry.canonical_timestamp
    if timestamp is None:
        return None

    if entry.type == "cal":
        # Calibration records aren't glucose readings -- they record
        # slope/intercept changes the CGM applied. Out of scope for
        # the translator's input layer; future work could store them
        # for noise/calibration-window analysis.
        return None

    # Pick the value field by type. sgv = CGM; mbg = manual BG.
    if entry.type == "sgv":
        if entry.is_glucose_gap:
            return None
        if entry.sgv is None:
            return None
        # sgv is mg/dL on the wire (entries carry no unit field) -- store as-is.
        value = int(round(entry.sgv))
        trend = map_ns_direction(entry.direction)
        # entry.delta is the glucose change (mg/dL) between consecutive CGM readings,
        # carried through as trend_rate. It stays mg/dL like every stored value; a mmol/L
        # display surface must convert it as a SPREAD (offset-free /MGDL_PER_MMOL), not as a
        # value -- cross-surface open question, no consumer renders trend_rate to the user yet.
        trend_rate = entry.delta if entry.delta is not None else None
    elif entry.type == "mbg":
        if entry.mbg is None:
            return None
        # mbg is mg/dL on the wire (entries carry no unit field) -- store as-is.
        value = int(round(entry.mbg))
        # Fingersticks have no trend signal -- meter readings are
        # point-in-time.
        trend = TrendDirection.NOT_COMPUTABLE
        trend_rate = None
    else:
        # Unknown entry type -- preserve nothing rather than guess.
        return None

    return {
        "user_id": user_id,
        "value": value,
        "reading_timestamp": timestamp,
        "trend": trend,
        "trend_rate": trend_rate,
        "received_at": received_at or datetime.now(UTC),
        "source": source,
        "ns_id": entry.id,
    }


def map_bg_check_treatment_to_glucose_reading(
    treatment: NightscoutTreatment,
    *,
    user_id: str,
    source: str,
    received_at: datetime | None = None,
    profile_units: str | None = None,
) -> dict[str, Any] | None:
    """Map a treatments-route fingerstick (BG Check) to a GlucoseReading.

    The treatments-route path is xDrip4iOS / Care Portal: same logical
    event as an entries[type=mbg] record. Only fires when the
    treatment is detected as a fingerstick (eventType="BG Check" OR
    glucoseType="Finger") -- callers should gate on
    `treatment.is_fingerstick_treatment` before calling this.

    `profile_units` is the connection's Nightscout profile units,
    used as the fallback when the treatment carries no recognizable
    `units` of its own (issue #1059 -- same fallback as the bolus
    mapper, via the shared `resolve_treatment_glucose_units` helper).

    Returns None when:
    - Glucose value is missing
    - Timestamp is missing
    - The converted value is non-finite (a huge mmol value overflows
      to inf) or outside the canonical 20-500 mg/dL range -- mirrors
      the bolus mapper (`_map_bolus`); `glucose_readings.value` carries
      no range constraint of its own, so out-of-range readings are
      skipped here rather than stored.
    """
    timestamp = treatment.canonical_timestamp
    if timestamp is None or treatment.glucose is None:
        return None

    # Per-record `units` field can override the default (rare).
    # Convert mmol/L to mg/dL using the project-wide conversion factor
    # (single source of truth in `src.core.units`). When the record
    # carries no recognizable `units`, the connection's profile units
    # apply instead (issue #1059); the shared normalizer also accepts
    # the wider spellings ("mmol/litre", "mmoll") the profile-side
    # normalizers recognize.
    glucose_value = treatment.glucose
    if (
        resolve_treatment_glucose_units(treatment.units, profile_units=profile_units)
        == "mmol"
    ):
        glucose_value = glucose_value * MGDL_PER_MMOL

    # A huge mmol value overflows to inf on conversion, and
    # int(round(inf)) raises OverflowError before the range check
    # below can reject it -- so finiteness is checked before rounding,
    # exactly as `_map_bolus` does. The 20-500 check stays on the
    # rounded value so values that round into range (e.g. 1.1 mmol =
    # 19.8 mg/dL -> 20) still map instead of being skipped.
    if not math.isfinite(glucose_value):
        return None
    value = int(round(glucose_value))
    if not 20 <= value <= 500:
        return None

    return {
        "user_id": user_id,
        "value": value,
        "reading_timestamp": timestamp,
        "trend": TrendDirection.NOT_COMPUTABLE,
        "trend_rate": None,
        "received_at": received_at or datetime.now(UTC),
        "source": source,
        "ns_id": treatment.id,
    }
