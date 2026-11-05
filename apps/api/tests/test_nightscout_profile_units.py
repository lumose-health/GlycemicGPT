"""Tests for extract_profile_units (issue #1059).

The sync service reads the connection's profile units from the freshly
fetched Nightscout profile and hands them to the treatment mappers as
the fallback when a treatment glucose value carries no recognizable
`units` of its own. Pure function tests -- no DB.
"""

from __future__ import annotations

from src.services.integrations.nightscout._profile_mapper import (
    extract_profile_units,
)


def _profile(*, store_units=None, profile_units=None, default="Default"):
    raw: dict = {
        "_id": "65f4b1a2c8e3d2f1a0b1c400",
        "defaultProfile": default,
        "startDate": "2026-05-06T00:00:00.000Z",
        "store": {default: {"dia": 3.0}},
    }
    if store_units is not None:
        raw["store"][default]["units"] = store_units
    if profile_units is not None:
        raw["units"] = profile_units
    return raw


def test_active_store_units_win():
    assert extract_profile_units(_profile(store_units="mmol")) == "mmol"


def test_falls_back_to_profile_level_units():
    assert extract_profile_units(_profile(profile_units="mmol/litre")) == "mmol/litre"


def test_store_units_win_over_profile_level():
    assert (
        extract_profile_units(_profile(store_units="mg/dl", profile_units="mmol"))
        == "mg/dl"
    )


def test_none_when_no_units_anywhere():
    assert extract_profile_units(_profile()) is None


def test_none_for_malformed_profile():
    # defaultProfile points at a store that does not exist.
    assert extract_profile_units(_profile(default="Missing")) is None
    assert extract_profile_units({"defaultProfile": 123}) is None
    assert extract_profile_units(None) is None
