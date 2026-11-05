"""Issue #1020: response budget and unusable-output refusal for analyses.

The daily brief and the meal / correction analyses resolve their token
budget from the user's ``max_response_tokens`` setting, and refuse to store
an empty or length-truncated response.
"""

import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException

from src.core.units import GlucoseUnit
from src.models.ai_provider import AIProviderType
from src.schemas.ai_response import AIResponse, AIUsage
from src.schemas.correction_analysis import TimePeriodData
from src.schemas.daily_brief import DailyBriefMetrics
from src.schemas.meal_analysis import MealPeriodData
from src.services.ai_client import (
    ANALYSIS_MAX_RESPONSE_TOKENS,
    EMPTY_AI_RESPONSE_DETAIL,
    TRUNCATED_AI_RESPONSE_DETAIL,
)
from src.services.correction_analysis import generate_correction_analysis
from src.services.daily_brief import generate_daily_brief
from src.services.meal_analysis import generate_meal_analysis


def _response(content: str, *, truncated: bool = False) -> AIResponse:
    return AIResponse(
        content=content,
        model="test-model",
        provider=AIProviderType.OPENAI_COMPATIBLE,
        usage=AIUsage(input_tokens=100, output_tokens=50),
        truncated=truncated,
    )


def _user() -> SimpleNamespace:
    return SimpleNamespace(
        id=uuid.uuid4(),
        glucose_unit=GlucoseUnit.MGDL,
        meal_intelligence_enabled=False,
    )


_METRICS = DailyBriefMetrics(
    time_in_range_pct=72.5,
    average_glucose=145.0,
    low_count=1,
    high_count=8,
    readings_count=288,
    correction_count=5,
    total_insulin=40.0,
)

_MEAL_PERIODS = [
    MealPeriodData(
        period="breakfast",
        bolus_count=5,
        spike_count=3,
        avg_peak_glucose=195.0,
        avg_2hr_glucose=175.0,
    ),
    MealPeriodData(
        period="lunch",
        bolus_count=4,
        spike_count=1,
        avg_peak_glucose=165.0,
        avg_2hr_glucose=145.0,
    ),
]

_TIME_PERIODS = [
    TimePeriodData(
        period="morning",
        correction_count=6,
        under_count=3,
        over_count=0,
        avg_observed_isf=30.0,
        avg_glucose_drop=60.0,
    ),
    TimePeriodData(
        period="afternoon",
        correction_count=4,
        under_count=0,
        over_count=1,
        avg_observed_isf=50.0,
        avg_glucose_drop=100.0,
    ),
]

_NORMAL_TEXT = "Glucose was mostly in range with a few afternoon highs."


def _db() -> AsyncMock:
    """Session stub: sync ``add`` and empty query results, so the services'
    optional context lookups run their normal (no data) path."""
    db = AsyncMock()
    db.add = MagicMock()
    result = MagicMock()
    result.scalar_one_or_none.return_value = None
    result.scalar.return_value = None
    result.scalars.return_value.all.return_value = []
    result.all.return_value = []
    db.execute.return_value = result
    return db


def _patch_budget(override: int | None):
    return patch(
        "src.services.ai_client.get_user_max_response_tokens",
        new=AsyncMock(return_value=override),
    )


async def _run_brief(response: AIResponse, override: int | None, db: AsyncMock):
    module = "src.services.daily_brief"
    client = AsyncMock()
    client.generate.return_value = response
    with (
        _patch_budget(override),
        patch(f"{module}.get_ai_client", return_value=client),
        patch(f"{module}.calculate_metrics", return_value=_METRICS),
        patch(f"{module}.get_excluded_cgm_sources", new=AsyncMock(return_value=[])),
        patch(f"{module}.get_pump_profile_summary", new=AsyncMock(return_value=None)),
        patch(f"{module}.format_iob_for_prompt", new=AsyncMock(return_value=None)),
        patch(f"{module}.notify_user_of_brief", new=AsyncMock()),
    ):
        result = await generate_daily_brief(_user(), db, hours=24)
    return result, client


async def _run_meal(response: AIResponse, override: int | None, db: AsyncMock):
    module = "src.services.meal_analysis"
    client = AsyncMock()
    client.generate.return_value = response
    with (
        _patch_budget(override),
        patch(f"{module}.get_ai_client", return_value=client),
        patch(f"{module}.analyze_post_meal_patterns", return_value=_MEAL_PERIODS),
        patch(f"{module}.get_pump_profile_summary", new=AsyncMock(return_value=None)),
    ):
        result = await generate_meal_analysis(_user(), db, days=7)
    return result, client


async def _run_correction(response: AIResponse, override: int | None, db: AsyncMock):
    module = "src.services.correction_analysis"
    client = AsyncMock()
    client.generate.return_value = response
    with (
        _patch_budget(override),
        patch(f"{module}.get_ai_client", return_value=client),
        patch(f"{module}.analyze_correction_outcomes", return_value=_TIME_PERIODS),
        patch(f"{module}.get_pump_profile_summary", new=AsyncMock(return_value=None)),
    ):
        result = await generate_correction_analysis(_user(), db, days=7)
    return result, client


# (runner, module path, stored-text attribute)
_SURFACES = [
    pytest.param((_run_brief, "src.services.daily_brief", "ai_summary"), id="brief"),
    pytest.param((_run_meal, "src.services.meal_analysis", "ai_analysis"), id="meal"),
    pytest.param(
        (_run_correction, "src.services.correction_analysis", "ai_analysis"),
        id="correction",
    ),
]


@pytest.mark.parametrize("surface", _SURFACES)
class TestAnalysisSurfaces:
    async def test_user_budget_passed_through(self, surface):
        run, _, _ = surface
        _, client = await run(_response(_NORMAL_TEXT), 4096, _db())
        assert client.generate.call_args.kwargs["max_tokens"] == 4096

    async def test_default_budget_when_no_override(self, surface):
        run, _, _ = surface
        _, client = await run(_response(_NORMAL_TEXT), None, _db())
        assert (
            client.generate.call_args.kwargs["max_tokens"]
            == ANALYSIS_MAX_RESPONSE_TOKENS
        )

    async def test_normal_response_stored(self, surface):
        run, _, text_attr = surface
        db = _db()
        result, _ = await run(_response(_NORMAL_TEXT), None, db)
        assert _NORMAL_TEXT in getattr(result, text_attr)
        db.add.assert_called()
        db.commit.assert_awaited_once()

    @pytest.mark.parametrize(
        ("content", "truncated", "detail"),
        [
            pytest.param("", False, EMPTY_AI_RESPONSE_DETAIL, id="empty"),
            pytest.param(
                "Glucose was mostly", True, TRUNCATED_AI_RESPONSE_DETAIL, id="cut-off"
            ),
        ],
    )
    async def test_unusable_response_not_stored(
        self, surface, content, truncated, detail
    ):
        run, module, _ = surface
        db = _db()
        with (
            patch(f"{module}.validate_ai_suggestion") as mock_validate,
            pytest.raises(HTTPException) as exc_info,
        ):
            await run(_response(content, truncated=truncated), 8192, db)
        assert exc_info.value.status_code == 502
        assert exc_info.value.detail == detail
        mock_validate.assert_not_called()
        db.add.assert_not_called()
        db.commit.assert_not_awaited()
