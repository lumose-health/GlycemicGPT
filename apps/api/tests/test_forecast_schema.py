"""Defensive forecast response schema tests."""

import pytest

from src.schemas.forecast import curves_from_jsonb


def test_curves_from_jsonb_drops_unknown_and_malformed_curves():
    curves = curves_from_jsonb(
        {
            "main": [120, "unexpected", 130],
            "IOB": {"value": 120},
            "COB": [120, float("nan")],
            "UAM": [120, 122, 125],
            "aCOB": [120, 121, 122],
        }
    )

    assert curves.main is None
    assert curves.IOB is None
    assert curves.COB is None
    assert curves.UAM == [120.0, 122.0, 125.0]
    assert curves.ZT is None


def test_curves_from_jsonb_handles_non_object_payload():
    assert curves_from_jsonb("unexpected").model_dump() == {
        "main": None,
        "IOB": None,
        "COB": None,
        "UAM": None,
        "ZT": None,
    }


@pytest.mark.parametrize("value", [10**1000, 19, 801, float("inf"), float("-inf")])
def test_curves_from_jsonb_rejects_unsafe_glucose_values(value):
    assert curves_from_jsonb({"main": [value]}).main is None


@pytest.mark.parametrize("value", [20, 800])
def test_curves_from_jsonb_accepts_inclusive_glucose_boundaries(value):
    assert curves_from_jsonb({"main": [value]}).main == [float(value)]
