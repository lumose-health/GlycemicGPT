"""Map Nightscout profile records to NightscoutProfileSnapshot rows.

The snapshot is a read-only mirror of the user's Nightscout-side
profile -- written on each profile fetch, read by the onboarding
wizard to pre-fill the user's canonical settings form. Time-series
schedules (basal / carb_ratio / sensitivity / target_low /
target_high) are preserved verbatim as `(time, value)` lists; per-entry
duration is implicit (computed downstream by the wizard) and the
midnight-wrap edge case (first entry not at 00:00) is also the
wizard's responsibility.

One snapshot row per (user, connection); upserts on re-fetch.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from src.services.integrations.nightscout._treatment_units import (
    normalize_glucose_units,
)
from src.services.integrations.nightscout.models import (
    NightscoutProfile,
    NightscoutProfileStore,
)


def extract_profile_units(raw_profile: dict[str, Any] | None) -> str | None:
    """Best-effort glucose units for a raw Nightscout profile record.

    Returns the active store's `units`, falling back to the
    profile-level default -- the same precedence
    `map_profile_to_snapshot` uses for `source_units`. Returns None
    when the record is missing, malformed, or carries no units; the
    caller then treats that as "no profile fallback available" rather
    than a sync failure. The returned string is unnormalized -- the
    treatment mappers run it through the shared normalizer.

    Units are read straight off the raw dict rather than through full
    `NightscoutProfile` validation: a single invalid field anywhere in
    the document (e.g. a bad `dia` in an inactive store) would reject
    the whole profile and lose units that are present and valid. Only
    the first candidate the shared normalizer recognizes is returned,
    so an unrecognized active-store value (blank, "banana") does not
    block the profile-level fallback.
    """
    if not isinstance(raw_profile, dict):
        return None
    candidates: list[Any] = []
    store = raw_profile.get("store")
    default = raw_profile.get("defaultProfile")
    if isinstance(store, dict) and isinstance(default, str):
        active = store.get(default)
        if isinstance(active, dict):
            candidates.append(active.get("units"))
    candidates.append(raw_profile.get("units"))
    for candidate in candidates:
        if normalize_glucose_units(candidate) is not None:
            return candidate
    return None


def map_profile_to_snapshot(
    profile: NightscoutProfile,
    *,
    user_id: str,
    nightscout_connection_id: str,
    fetched_at: datetime | None = None,
) -> dict[str, Any] | None:
    """Map a Nightscout profile record to a snapshot insert dict.

    Returns None when:
    - The profile has no `defaultProfile` pointer or the pointer's
      target store doesn't exist (the wizard has nothing to render
      from a profile with no active store).
    """
    active = profile.active_profile()
    if active is None:
        return None

    return {
        "user_id": user_id,
        "nightscout_connection_id": nightscout_connection_id,
        "fetched_at": fetched_at or datetime.now(UTC),
        "source_default_profile_name": profile.default_profile,
        "source_units": active.units or profile.units,
        "source_timezone": active.timezone,
        "source_dia_hours": active.dia,
        "source_start_date": _parse_iso(profile.start_date),
        "basal_segments": _segments(active, "basal"),
        "carb_ratio_segments": _segments(active, "carbratio"),
        "sensitivity_segments": _segments(active, "sens"),
        "target_low_segments": _segments(active, "target_low"),
        "target_high_segments": _segments(active, "target_high"),
        # `mode="json"` so any datetime / UUID values in the profile
        # tree serialize to strings rather than Python objects -- the
        # JSONB column rejects raw datetime objects at write time.
        "profile_json_full": profile.model_dump(
            by_alias=True, exclude_none=True, mode="json"
        ),
    }


def _segments(store: NightscoutProfileStore, attr: str) -> list[dict[str, Any]] | None:
    """Pull a time-segmented list off a profile store, defensively.

    Returns None when the store doesn't carry the attribute at all
    (some sparse profiles omit fields). The list is preserved as-is
    -- entries are typed as `dict[str, Any]` so the wizard sees the
    raw `{time, value, timeAsSeconds?}` shape.
    """
    value = getattr(store, attr, None)
    if not isinstance(value, list):
        return None
    return value


def _parse_iso(value: str | None) -> datetime | None:
    if not value:
        return None
    s = value.replace("Z", "+00:00") if value.endswith("Z") else value
    try:
        dt = datetime.fromisoformat(s)
    except ValueError:
        return None
    return dt.astimezone(UTC) if dt.tzinfo else dt.replace(tzinfo=UTC)
