"""Shared glucose-unit normalization for Nightscout treatment mappers.

Both treatment-glucose call sites -- `_map_bolus` (`bg_at_event` on
pump events, issue #1023) and `map_bg_check_treatment_to_glucose_reading`
(fingerstick BG Checks) -- read the treatment's optional `units` field
and convert mmol/L to mg/dL. Each site used to inline its own
two-spelling check ("mmol", "mmol/l"), so the wider spellings
Nightscout profiles use ("mmol/litre", "mmoll" -- recognized by
`evaluate._normalize_units` and `onboarding_derive._classify_units`)
silently fell through to mg/dL.

This module is the single normalizer for the treatment mappers: it
recognizes the same variant lists as the profile-side normalizers, and
resolves the effective units for a treatment glucose value -- the
record's own `units` first, falling back to the connection's profile
units when the record carries none (issue #1059).
"""

from __future__ import annotations

# Accepted variants, mirroring evaluate._normalize_units and
# onboarding_derive._classify_units so all three agree on what counts
# as a recognized unit string. Case-insensitive (callers lowercase).
_KNOWN_MGDL_UNITS = frozenset({"mg/dl", "mgdl", "mg-dl"})
_KNOWN_MMOL_UNITS = frozenset({"mmol", "mmol/l", "mmol/litre", "mmoll"})


def normalize_glucose_units(raw: str | None) -> str | None:
    """Normalize a Nightscout glucose-units string to "mg/dl" / "mmol".

    Returns None for a missing, blank, or unrecognized value so the
    caller can fall back (profile units, then the mg/dL default)
    instead of guessing.
    """
    if not isinstance(raw, str):
        return None
    normalized = raw.strip().lower()
    if normalized in _KNOWN_MGDL_UNITS:
        return "mg/dl"
    if normalized in _KNOWN_MMOL_UNITS:
        return "mmol"
    return None


def resolve_treatment_glucose_units(
    record_units: str | None,
    *,
    profile_units: str | None = None,
) -> str | None:
    """Resolve the effective units for a treatment glucose value.

    The record's own `units` wins when recognized; otherwise the
    connection's profile units apply (issue #1059: on an mmol site a
    treatment with no `units` and a glucose of 20-27.7 was stored as
    20-27 mg/dL). Returns None when neither source recognizes a unit
    -- the caller then keeps the historical mg/dL default.
    """
    return normalize_glucose_units(record_units) or normalize_glucose_units(
        profile_units
    )
