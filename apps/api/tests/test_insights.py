"""Stories 5.7-5.8: Tests for AI insights service and router."""

import uuid
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from src.config import settings
from src.main import app
from src.services.insights import (
    _brief_title,
    _correction_title,
    _extract_data_context,
    _get_content,
    _meal_title,
    get_insight_detail,
    list_insights,
    record_suggestion_response,
    verify_analysis_ownership,
)


def unique_email(prefix: str = "test") -> str:
    """Generate a unique email for testing."""
    return f"{prefix}_{uuid.uuid4().hex[:8]}@example.com"


async def register_and_login(client: AsyncClient) -> str:
    """Register a new user and return the session cookie value."""
    email = unique_email("insights")
    password = "SecurePass123"

    await client.post(
        "/api/auth/register",
        json={"email": email, "password": password},
    )

    login_response = await client.post(
        "/api/auth/login",
        json={"email": email, "password": password},
    )

    return login_response.cookies.get(settings.jwt_cookie_name)


# --- Title generation tests ---


class TestBriefTitle:
    """Tests for _brief_title helper."""

    def test_formats_date(self):
        brief = SimpleNamespace(period_end=datetime(2026, 2, 8, tzinfo=UTC))
        assert _brief_title(brief) == "Daily Brief — Feb 08, 2026"

    def test_formats_different_date(self):
        brief = SimpleNamespace(period_end=datetime(2025, 12, 25, tzinfo=UTC))
        assert _brief_title(brief) == "Daily Brief — Dec 25, 2025"


class TestMealTitle:
    """Tests for _meal_title helper."""

    def test_singular_spike(self):
        analysis = SimpleNamespace(total_spikes=1)
        assert _meal_title(analysis) == "Meal Pattern Analysis — 1 spike detected"

    def test_plural_spikes(self):
        analysis = SimpleNamespace(total_spikes=3)
        assert _meal_title(analysis) == "Meal Pattern Analysis — 3 spikes detected"

    def test_zero_spikes(self):
        analysis = SimpleNamespace(total_spikes=0)
        assert _meal_title(analysis) == "Meal Pattern Analysis — 0 spikes detected"


class TestCorrectionTitle:
    """Tests for _correction_title helper."""

    def test_singular_correction(self):
        analysis = SimpleNamespace(total_corrections=1)
        assert (
            _correction_title(analysis)
            == "Correction Factor Analysis — 1 correction analyzed"
        )

    def test_plural_corrections(self):
        analysis = SimpleNamespace(total_corrections=5)
        assert (
            _correction_title(analysis)
            == "Correction Factor Analysis — 5 corrections analyzed"
        )


# --- Service tests ---


class TestListInsights:
    """Tests for list_insights service function."""

    @pytest.mark.asyncio
    async def test_returns_empty_when_no_data(self):
        """Returns empty list and zero total when no analyses exist."""
        user_id = uuid.uuid4()

        mock_db = AsyncMock()
        empty_result = MagicMock()
        empty_result.scalars.return_value.all.return_value = []
        empty_result.all.return_value = []
        mock_db.execute = AsyncMock(return_value=empty_result)

        insights, total = await list_insights(user_id, mock_db)

        assert insights == []
        assert total == 0

    @pytest.mark.asyncio
    async def test_aggregates_briefs_with_ai_summary(self):
        """Aggregates daily briefs using ai_summary field (not ai_analysis)."""
        user_id = uuid.uuid4()
        brief_id = uuid.uuid4()
        now = datetime.now(UTC)

        # F1/F10: Use ai_summary to match the real DailyBrief model
        brief = SimpleNamespace(
            id=brief_id,
            period_end=now,
            ai_summary="Test analysis content from brief",
            created_at=now,
        )

        mock_db = AsyncMock()
        call_count = 0

        async def mock_execute(query):
            nonlocal call_count
            call_count += 1

            result = MagicMock()
            if call_count == 1:
                result.scalars.return_value.all.return_value = [brief]
            elif call_count in (2, 3):
                result.scalars.return_value.all.return_value = []
            else:
                result.all.return_value = []
            return result

        mock_db.execute = AsyncMock(side_effect=mock_execute)

        insights, total = await list_insights(user_id, mock_db)

        assert total == 1
        assert len(insights) == 1
        assert insights[0].analysis_type == "daily_brief"
        assert insights[0].id == brief_id
        assert "Daily Brief" in insights[0].title
        assert insights[0].content == "Test analysis content from brief"
        assert insights[0].status == "pending"

    @pytest.mark.asyncio
    async def test_aggregates_mixed_types_sorted_by_date(self):
        """Aggregates and sorts insights from all three analysis types."""
        user_id = uuid.uuid4()
        now = datetime.now(UTC)

        brief = SimpleNamespace(
            id=uuid.uuid4(),
            period_end=now,
            ai_summary="Brief content",
            created_at=now - timedelta(hours=2),
        )
        meal = SimpleNamespace(
            id=uuid.uuid4(),
            total_spikes=2,
            ai_analysis="Meal content",
            created_at=now,  # Most recent
        )
        correction = SimpleNamespace(
            id=uuid.uuid4(),
            total_corrections=3,
            ai_analysis="Correction content",
            created_at=now - timedelta(hours=1),
        )

        mock_db = AsyncMock()
        call_count = 0

        async def mock_execute(query):
            nonlocal call_count
            call_count += 1

            result = MagicMock()
            if call_count == 1:
                result.scalars.return_value.all.return_value = [brief]
            elif call_count == 2:
                result.scalars.return_value.all.return_value = [meal]
            elif call_count == 3:
                result.scalars.return_value.all.return_value = [correction]
            else:
                result.all.return_value = []
            return result

        mock_db.execute = AsyncMock(side_effect=mock_execute)

        insights, total = await list_insights(user_id, mock_db)

        assert total == 3
        assert len(insights) == 3
        # Verify sorted by created_at descending
        assert insights[0].analysis_type == "meal_analysis"
        assert insights[1].analysis_type == "correction_analysis"
        assert insights[2].analysis_type == "daily_brief"

    @pytest.mark.asyncio
    async def test_respects_limit(self):
        """Returns at most `limit` insights."""
        user_id = uuid.uuid4()
        now = datetime.now(UTC)

        briefs = [
            SimpleNamespace(
                id=uuid.uuid4(),
                period_end=now - timedelta(hours=i),
                ai_summary=f"Brief {i}",
                created_at=now - timedelta(hours=i),
            )
            for i in range(5)
        ]

        mock_db = AsyncMock()
        call_count = 0

        async def mock_execute(query):
            nonlocal call_count
            call_count += 1

            result = MagicMock()
            if call_count == 1:
                result.scalars.return_value.all.return_value = briefs
            elif call_count in (2, 3):
                result.scalars.return_value.all.return_value = []
            else:
                result.all.return_value = []
            return result

        mock_db.execute = AsyncMock(side_effect=mock_execute)

        insights, total = await list_insights(user_id, mock_db, limit=3)

        assert total == 5
        assert len(insights) == 3

    @pytest.mark.asyncio
    async def test_filters_by_analysis_type(self):
        """Returns only the requested insight type."""
        user_id = uuid.uuid4()
        now = datetime.now(UTC)
        brief = SimpleNamespace(
            id=uuid.uuid4(),
            period_end=now,
            ai_summary="Brief content",
            created_at=now,
        )
        meal = SimpleNamespace(
            id=uuid.uuid4(),
            total_spikes=2,
            ai_analysis="Meal content",
            created_at=now,
        )

        mock_db = AsyncMock()
        call_count = 0

        async def mock_execute(query):
            nonlocal call_count
            call_count += 1
            result = MagicMock()
            if call_count == 1:
                result.scalars.return_value.all.return_value = [brief]
            elif call_count == 2:
                result.scalars.return_value.all.return_value = [meal]
            elif call_count == 3:
                result.scalars.return_value.all.return_value = []
            else:
                result.all.return_value = []
            return result

        mock_db.execute = AsyncMock(side_effect=mock_execute)

        insights, total = await list_insights(
            user_id,
            mock_db,
            analysis_type="daily_brief",
        )

        assert total == 1
        assert [insight.analysis_type for insight in insights] == ["daily_brief"]

    @pytest.mark.asyncio
    async def test_status_from_responses(self):
        """Insights show acknowledged/dismissed status from user responses."""
        user_id = uuid.uuid4()
        brief_id = uuid.uuid4()
        now = datetime.now(UTC)

        brief = SimpleNamespace(
            id=brief_id,
            period_end=now,
            ai_summary="Test",
            created_at=now,
        )

        mock_db = AsyncMock()
        call_count = 0

        async def mock_execute(query):
            nonlocal call_count
            call_count += 1

            result = MagicMock()
            if call_count == 1:
                result.scalars.return_value.all.return_value = [brief]
            elif call_count in (2, 3):
                result.scalars.return_value.all.return_value = []
            else:
                # Response lookup: this brief was acknowledged
                result.all.return_value = [("daily_brief", brief_id, "acknowledged")]
            return result

        mock_db.execute = AsyncMock(side_effect=mock_execute)

        insights, total = await list_insights(user_id, mock_db)

        assert insights[0].status == "acknowledged"


class TestRecordSuggestionResponse:
    """Tests for record_suggestion_response service function."""

    @pytest.mark.asyncio
    async def test_creates_response_record(self):
        """Creates a SuggestionResponse and commits."""
        user_id = uuid.uuid4()
        analysis_id = uuid.uuid4()
        mock_db = AsyncMock()

        # Mock get_response_for_analysis to return None (no existing)
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        mock_db.execute = AsyncMock(return_value=mock_result)

        entry = await record_suggestion_response(
            user_id=user_id,
            analysis_type="daily_brief",
            analysis_id=analysis_id,
            response="acknowledged",
            reason="Helpful insight",
            db=mock_db,
        )

        assert entry.user_id == user_id
        assert entry.analysis_type == "daily_brief"
        assert entry.analysis_id == analysis_id
        assert entry.response == "acknowledged"
        assert entry.reason == "Helpful insight"
        mock_db.add.assert_called_once()
        mock_db.commit.assert_awaited_once()
        mock_db.refresh.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_creates_dismissed_response(self):
        """Creates a dismissed response without reason."""
        user_id = uuid.uuid4()
        analysis_id = uuid.uuid4()
        mock_db = AsyncMock()

        # Mock get_response_for_analysis to return None (no existing)
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        mock_db.execute = AsyncMock(return_value=mock_result)

        entry = await record_suggestion_response(
            user_id=user_id,
            analysis_type="meal_analysis",
            analysis_id=analysis_id,
            response="dismissed",
            reason=None,
            db=mock_db,
        )

        assert entry.response == "dismissed"
        assert entry.reason is None

    @pytest.mark.asyncio
    async def test_duplicate_response_returns_409(self):
        """Attempting to respond twice to the same analysis returns 409."""
        from fastapi import HTTPException

        user_id = uuid.uuid4()
        analysis_id = uuid.uuid4()
        mock_db = AsyncMock()

        # Mock get_response_for_analysis to return an existing response
        existing = SimpleNamespace(
            id=uuid.uuid4(),
            response="acknowledged",
        )
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = existing
        mock_db.execute = AsyncMock(return_value=mock_result)

        with pytest.raises(HTTPException) as exc_info:
            await record_suggestion_response(
                user_id=user_id,
                analysis_type="daily_brief",
                analysis_id=analysis_id,
                response="dismissed",
                reason=None,
                db=mock_db,
            )

        assert exc_info.value.status_code == 409
        assert "already been recorded" in exc_info.value.detail


class TestVerifyAnalysisOwnership:
    """Tests for verify_analysis_ownership."""

    @pytest.mark.asyncio
    async def test_invalid_type_raises_400(self):
        """Invalid analysis type raises 400."""
        from fastapi import HTTPException

        mock_db = AsyncMock()

        with pytest.raises(HTTPException) as exc_info:
            await verify_analysis_ownership(
                uuid.uuid4(), "invalid_type", uuid.uuid4(), mock_db
            )

        assert exc_info.value.status_code == 400

    @pytest.mark.asyncio
    async def test_not_found_raises_404(self):
        """Non-existent analysis raises 404."""
        from fastapi import HTTPException

        mock_db = AsyncMock()
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        mock_db.execute = AsyncMock(return_value=mock_result)

        with pytest.raises(HTTPException) as exc_info:
            await verify_analysis_ownership(
                uuid.uuid4(), "daily_brief", uuid.uuid4(), mock_db
            )

        assert exc_info.value.status_code == 404

    @pytest.mark.asyncio
    async def test_found_passes_silently(self):
        """Existing analysis owned by user passes without exception."""
        mock_db = AsyncMock()
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = uuid.uuid4()
        mock_db.execute = AsyncMock(return_value=mock_result)

        # Should not raise
        await verify_analysis_ownership(
            uuid.uuid4(), "daily_brief", uuid.uuid4(), mock_db
        )


# --- Router / endpoint tests ---


class TestGetInsightsEndpoint:
    """Tests for GET /api/ai/insights."""

    @pytest.mark.asyncio
    async def test_unauthenticated_returns_401(self):
        """Unauthenticated request returns 401."""
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            response = await client.get("/api/ai/insights")
            assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_authenticated_returns_insights(self):
        """Authenticated request returns insights list."""
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            cookie = await register_and_login(client)

            with patch(
                "src.routers.insights.list_insights",
                new_callable=AsyncMock,
                return_value=([], 0),
            ):
                response = await client.get(
                    "/api/ai/insights",
                    cookies={settings.jwt_cookie_name: cookie},
                )

                assert response.status_code == 200
                data = response.json()
                assert data["insights"] == []
                assert data["total"] == 0

    @pytest.mark.asyncio
    async def test_limit_bounded_rejects_over_100(self):
        """Limit >100 returns 422 validation error."""
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            cookie = await register_and_login(client)

            response = await client.get(
                "/api/ai/insights?limit=101",
                cookies={settings.jwt_cookie_name: cookie},
            )

            assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_limit_bounded_rejects_zero(self):
        """Limit 0 returns 422 validation error."""
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            cookie = await register_and_login(client)

            response = await client.get(
                "/api/ai/insights?limit=0",
                cookies={settings.jwt_cookie_name: cookie},
            )

            assert response.status_code == 422


class TestRespondToInsightEndpoint:
    """Tests for POST /api/ai/insights/{type}/{id}/respond."""

    @pytest.mark.asyncio
    async def test_unauthenticated_returns_401(self):
        """Unauthenticated request returns 401."""
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            analysis_id = uuid.uuid4()
            response = await client.post(
                f"/api/ai/insights/daily_brief/{analysis_id}/respond",
                json={"response": "acknowledged"},
            )
            assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_invalid_analysis_type_returns_400(self):
        """Invalid analysis type returns 400."""
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            cookie = await register_and_login(client)
            analysis_id = uuid.uuid4()

            response = await client.post(
                f"/api/ai/insights/invalid_type/{analysis_id}/respond",
                json={"response": "acknowledged"},
                cookies={settings.jwt_cookie_name: cookie},
            )

            assert response.status_code == 400
            assert "Invalid analysis type" in response.json()["detail"]

    @pytest.mark.asyncio
    async def test_invalid_uuid_returns_422(self):
        """Non-UUID analysis_id returns 422 validation error."""
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            cookie = await register_and_login(client)

            response = await client.post(
                "/api/ai/insights/daily_brief/not-a-uuid/respond",
                json={"response": "acknowledged"},
                cookies={settings.jwt_cookie_name: cookie},
            )

            assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_invalid_response_value_returns_422(self):
        """Invalid response value returns 422 (validation error)."""
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            cookie = await register_and_login(client)
            analysis_id = uuid.uuid4()

            response = await client.post(
                f"/api/ai/insights/daily_brief/{analysis_id}/respond",
                json={"response": "invalid_value"},
                cookies={settings.jwt_cookie_name: cookie},
            )

            assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_acknowledge_creates_response(self):
        """Valid acknowledge request creates response record."""
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            cookie = await register_and_login(client)
            analysis_id = uuid.uuid4()

            mock_entry = SimpleNamespace(
                id=uuid.uuid4(),
                analysis_type="daily_brief",
                analysis_id=analysis_id,
                response="acknowledged",
                reason=None,
                created_at=datetime.now(UTC),
            )

            with (
                patch(
                    "src.routers.insights.verify_analysis_ownership",
                    new_callable=AsyncMock,
                ),
                patch(
                    "src.routers.insights.record_suggestion_response",
                    new_callable=AsyncMock,
                    return_value=mock_entry,
                ),
            ):
                response = await client.post(
                    f"/api/ai/insights/daily_brief/{analysis_id}/respond",
                    json={"response": "acknowledged"},
                    cookies={settings.jwt_cookie_name: cookie},
                )

                assert response.status_code == 201
                data = response.json()
                assert data["response"] == "acknowledged"
                assert data["analysis_type"] == "daily_brief"

    @pytest.mark.asyncio
    async def test_dismiss_with_reason(self):
        """Dismiss with reason creates response record."""
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            cookie = await register_and_login(client)
            analysis_id = uuid.uuid4()

            mock_entry = SimpleNamespace(
                id=uuid.uuid4(),
                analysis_type="meal_analysis",
                analysis_id=analysis_id,
                response="dismissed",
                reason="Not relevant to me",
                created_at=datetime.now(UTC),
            )

            with (
                patch(
                    "src.routers.insights.verify_analysis_ownership",
                    new_callable=AsyncMock,
                ),
                patch(
                    "src.routers.insights.record_suggestion_response",
                    new_callable=AsyncMock,
                    return_value=mock_entry,
                ),
            ):
                response = await client.post(
                    f"/api/ai/insights/meal_analysis/{analysis_id}/respond",
                    json={
                        "response": "dismissed",
                        "reason": "Not relevant to me",
                    },
                    cookies={settings.jwt_cookie_name: cookie},
                )

                assert response.status_code == 201
                data = response.json()
                assert data["response"] == "dismissed"
                assert data["reason"] == "Not relevant to me"

    @pytest.mark.asyncio
    async def test_correction_analysis_type_accepted(self):
        """correction_analysis type is accepted."""
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            cookie = await register_and_login(client)
            analysis_id = uuid.uuid4()

            mock_entry = SimpleNamespace(
                id=uuid.uuid4(),
                analysis_type="correction_analysis",
                analysis_id=analysis_id,
                response="acknowledged",
                reason=None,
                created_at=datetime.now(UTC),
            )

            with (
                patch(
                    "src.routers.insights.verify_analysis_ownership",
                    new_callable=AsyncMock,
                ),
                patch(
                    "src.routers.insights.record_suggestion_response",
                    new_callable=AsyncMock,
                    return_value=mock_entry,
                ),
            ):
                response = await client.post(
                    f"/api/ai/insights/correction_analysis/{analysis_id}/respond",
                    json={"response": "acknowledged"},
                    cookies={settings.jwt_cookie_name: cookie},
                )

                assert response.status_code == 201


# --- Story 5.8: Reasoning & Audit tests ---


class TestExtractDataContext:
    """Tests for _extract_data_context helper."""

    def test_daily_brief_context(self):
        record = SimpleNamespace(
            time_in_range_pct=72.5,
            average_glucose=145.3,
            low_count=2,
            high_count=5,
            readings_count=288,
            correction_count=3,
            total_insulin=42.1,
        )
        ctx = _extract_data_context("daily_brief", record)
        assert ctx["time_in_range_pct"] == 72.5
        assert ctx["average_glucose"] == 145.3
        assert ctx["low_count"] == 2
        assert ctx["readings_count"] == 288
        assert ctx["total_insulin"] == 42.1

    def test_meal_analysis_context(self):
        record = SimpleNamespace(
            total_boluses=12,
            total_spikes=3,
            avg_post_meal_peak=210.5,
            meal_periods_data=[{"period": "breakfast"}],
        )
        ctx = _extract_data_context("meal_analysis", record)
        assert ctx["total_boluses"] == 12
        assert ctx["total_spikes"] == 3
        assert ctx["meal_periods_data"] == [{"period": "breakfast"}]

    def test_correction_analysis_context(self):
        record = SimpleNamespace(
            total_corrections=8,
            under_corrections=3,
            over_corrections=2,
            avg_observed_isf=45.0,
            time_periods_data=[{"period": "morning"}],
        )
        ctx = _extract_data_context("correction_analysis", record)
        assert ctx["total_corrections"] == 8
        assert ctx["under_corrections"] == 3
        assert ctx["time_periods_data"] == [{"period": "morning"}]


class TestGetContent:
    """Tests for _get_content helper."""

    def test_daily_brief_uses_ai_summary(self):
        record = SimpleNamespace(ai_summary="Summary text")
        assert _get_content("daily_brief", record) == "Summary text"

    def test_meal_analysis_uses_ai_analysis(self):
        record = SimpleNamespace(ai_analysis="Meal analysis text")
        assert _get_content("meal_analysis", record) == "Meal analysis text"

    def test_correction_analysis_uses_ai_analysis(self):
        record = SimpleNamespace(ai_analysis="Correction text")
        assert _get_content("correction_analysis", record) == "Correction text"


class TestGetInsightDetail:
    """Tests for get_insight_detail service function."""

    @pytest.mark.asyncio
    async def test_invalid_type_raises_400(self):
        """Invalid analysis type raises 400."""
        from fastapi import HTTPException

        mock_db = AsyncMock()

        with pytest.raises(HTTPException) as exc_info:
            await get_insight_detail(
                uuid.uuid4(), "invalid_type", uuid.uuid4(), mock_db
            )

        assert exc_info.value.status_code == 400

    @pytest.mark.asyncio
    async def test_not_found_raises_404(self):
        """Non-existent analysis raises 404."""
        from fastapi import HTTPException

        mock_db = AsyncMock()
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        mock_db.execute = AsyncMock(return_value=mock_result)

        with pytest.raises(HTTPException) as exc_info:
            await get_insight_detail(uuid.uuid4(), "daily_brief", uuid.uuid4(), mock_db)

        assert exc_info.value.status_code == 404

    @pytest.mark.asyncio
    async def test_returns_detail_for_daily_brief(self):
        """Returns InsightDetail with data context and model info for a brief."""
        user_id = uuid.uuid4()
        brief_id = uuid.uuid4()
        now = datetime.now(UTC)

        brief = SimpleNamespace(
            id=brief_id,
            user_id=user_id,
            period_start=now - timedelta(days=1),
            period_end=now,
            ai_summary="Test summary",
            ai_model="gpt-4",
            ai_provider="openai",
            input_tokens=500,
            output_tokens=200,
            time_in_range_pct=75.0,
            average_glucose=140.0,
            low_count=1,
            high_count=3,
            readings_count=288,
            correction_count=2,
            total_insulin=40.0,
            created_at=now,
        )

        mock_db = AsyncMock()
        call_count = 0

        async def mock_execute(query):
            nonlocal call_count
            call_count += 1

            result = MagicMock()
            if call_count == 1:
                result.scalar_one_or_none.return_value = brief
            elif call_count in (2, 3):
                result.scalar_one_or_none.return_value = None
            return result

        mock_db.execute = AsyncMock(side_effect=mock_execute)

        detail = await get_insight_detail(user_id, "daily_brief", brief_id, mock_db)

        assert detail.id == brief_id
        assert detail.analysis_type == "daily_brief"
        assert "Daily Brief" in detail.title
        assert detail.content == "Test summary"
        assert detail.status == "pending"
        assert detail.model_info.model == "gpt-4"
        assert detail.model_info.provider == "openai"
        assert detail.model_info.input_tokens == 500
        assert detail.data_context["time_in_range_pct"] == 75.0
        assert detail.data_context["readings_count"] == 288
        assert detail.safety is None
        assert detail.user_response is None

    @pytest.mark.asyncio
    async def test_includes_safety_info(self):
        """Returns safety validation info when a safety log exists."""
        user_id = uuid.uuid4()
        brief_id = uuid.uuid4()
        now = datetime.now(UTC)

        brief = SimpleNamespace(
            id=brief_id,
            user_id=user_id,
            period_start=now - timedelta(days=1),
            period_end=now,
            ai_summary="Test",
            ai_model="gpt-4",
            ai_provider="openai",
            input_tokens=100,
            output_tokens=50,
            time_in_range_pct=80.0,
            average_glucose=130.0,
            low_count=0,
            high_count=2,
            readings_count=288,
            correction_count=1,
            total_insulin=35.0,
            created_at=now,
        )

        safety = SimpleNamespace(
            status="approved",
            has_dangerous_content=False,
            flagged_items=[],
            created_at=now,
        )

        mock_db = AsyncMock()
        call_count = 0

        async def mock_execute(query):
            nonlocal call_count
            call_count += 1

            result = MagicMock()
            if call_count == 1:
                result.scalar_one_or_none.return_value = brief
            elif call_count == 2:
                result.scalar_one_or_none.return_value = safety
            elif call_count == 3:
                result.scalar_one_or_none.return_value = None
            return result

        mock_db.execute = AsyncMock(side_effect=mock_execute)

        detail = await get_insight_detail(user_id, "daily_brief", brief_id, mock_db)

        assert detail.safety is not None
        assert detail.safety.status == "approved"
        assert detail.safety.has_dangerous_content is False

    @pytest.mark.asyncio
    async def test_includes_user_response(self):
        """Returns user response info when a response exists."""
        user_id = uuid.uuid4()
        meal_id = uuid.uuid4()
        now = datetime.now(UTC)

        meal = SimpleNamespace(
            id=meal_id,
            user_id=user_id,
            period_start=now - timedelta(days=7),
            period_end=now,
            ai_analysis="Meal analysis",
            ai_model="claude-sonnet",
            ai_provider="anthropic",
            input_tokens=300,
            output_tokens=150,
            total_boluses=10,
            total_spikes=2,
            avg_post_meal_peak=200.0,
            meal_periods_data=[],
            created_at=now,
        )

        user_resp = SimpleNamespace(
            response="acknowledged",
            reason="Helpful info",
            created_at=now,
        )

        mock_db = AsyncMock()
        call_count = 0

        async def mock_execute(query):
            nonlocal call_count
            call_count += 1

            result = MagicMock()
            if call_count == 1:
                result.scalar_one_or_none.return_value = meal
            elif call_count == 2:
                result.scalar_one_or_none.return_value = None
            elif call_count == 3:
                result.scalar_one_or_none.return_value = user_resp
            return result

        mock_db.execute = AsyncMock(side_effect=mock_execute)

        detail = await get_insight_detail(user_id, "meal_analysis", meal_id, mock_db)

        assert detail.status == "acknowledged"
        assert detail.user_response is not None
        assert detail.user_response.response == "acknowledged"
        assert detail.user_response.reason == "Helpful info"

    @pytest.mark.asyncio
    async def test_correction_analysis_data_context(self):
        """Returns correct data context for correction analysis."""
        user_id = uuid.uuid4()
        corr_id = uuid.uuid4()
        now = datetime.now(UTC)

        correction = SimpleNamespace(
            id=corr_id,
            user_id=user_id,
            period_start=now - timedelta(days=7),
            period_end=now,
            ai_analysis="Correction analysis",
            ai_model="gpt-4",
            ai_provider="openai",
            input_tokens=400,
            output_tokens=100,
            total_corrections=6,
            under_corrections=2,
            over_corrections=1,
            avg_observed_isf=50.0,
            time_periods_data=[{"period": "overnight"}],
            created_at=now,
        )

        mock_db = AsyncMock()
        call_count = 0

        async def mock_execute(query):
            nonlocal call_count
            call_count += 1

            result = MagicMock()
            if call_count == 1:
                result.scalar_one_or_none.return_value = correction
            elif call_count in (2, 3):
                result.scalar_one_or_none.return_value = None
            return result

        mock_db.execute = AsyncMock(side_effect=mock_execute)

        detail = await get_insight_detail(
            user_id, "correction_analysis", corr_id, mock_db
        )

        assert detail.analysis_type == "correction_analysis"
        assert detail.data_context["total_corrections"] == 6
        assert detail.data_context["under_corrections"] == 2
        assert detail.data_context["over_corrections"] == 1
        assert detail.data_context["avg_observed_isf"] == 50.0


class TestGetInsightDetailEndpoint:
    """Tests for GET /api/ai/insights/{analysis_type}/{analysis_id}."""

    @pytest.mark.asyncio
    async def test_unauthenticated_returns_401(self):
        """Unauthenticated request returns 401."""
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            analysis_id = uuid.uuid4()
            response = await client.get(f"/api/ai/insights/daily_brief/{analysis_id}")
            assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_invalid_analysis_type_returns_400(self):
        """Invalid analysis type returns 400."""
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            cookie = await register_and_login(client)
            analysis_id = uuid.uuid4()

            response = await client.get(
                f"/api/ai/insights/invalid_type/{analysis_id}",
                cookies={settings.jwt_cookie_name: cookie},
            )

            assert response.status_code == 400
            assert "Invalid analysis type" in response.json()["detail"]

    @pytest.mark.asyncio
    async def test_invalid_uuid_returns_422(self):
        """Non-UUID analysis_id returns 422 validation error."""
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            cookie = await register_and_login(client)

            response = await client.get(
                "/api/ai/insights/daily_brief/not-a-uuid",
                cookies={settings.jwt_cookie_name: cookie},
            )

            assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_returns_detail(self):
        """Authenticated request returns insight detail."""
        from src.schemas.suggestion_response import InsightDetail, ModelInfo

        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            cookie = await register_and_login(client)
            analysis_id = uuid.uuid4()
            now = datetime.now(UTC)

            mock_detail = InsightDetail(
                id=analysis_id,
                analysis_type="daily_brief",
                title="Daily Brief — Feb 08, 2026",
                content="Test content",
                created_at=now,
                status="pending",
                period_start=now - timedelta(days=1),
                period_end=now,
                data_context={"time_in_range_pct": 75.0},
                model_info=ModelInfo(
                    model="gpt-4",
                    provider="openai",
                    input_tokens=500,
                    output_tokens=200,
                ),
                safety=None,
                user_response=None,
            )

            with patch(
                "src.routers.insights.get_insight_detail",
                new_callable=AsyncMock,
                return_value=mock_detail,
            ):
                response = await client.get(
                    f"/api/ai/insights/daily_brief/{analysis_id}",
                    cookies={settings.jwt_cookie_name: cookie},
                )

                assert response.status_code == 200
                data = response.json()
                assert data["id"] == str(analysis_id)
                assert data["analysis_type"] == "daily_brief"
                assert data["model_info"]["model"] == "gpt-4"
                assert data["data_context"]["time_in_range_pct"] == 75.0
                assert data["safety"] is None

    @pytest.mark.asyncio
    async def test_returns_detail_with_safety_and_response(self):
        """Detail endpoint serializes safety and user response correctly."""
        from src.schemas.suggestion_response import (
            InsightDetail,
            ModelInfo,
            SafetyInfo,
            UserResponseInfo,
        )

        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            cookie = await register_and_login(client)
            analysis_id = uuid.uuid4()
            now = datetime.now(UTC)

            mock_detail = InsightDetail(
                id=analysis_id,
                analysis_type="meal_analysis",
                title="Meal Pattern Analysis — 3 spikes detected",
                content="Meal analysis content",
                created_at=now,
                status="acknowledged",
                period_start=now - timedelta(days=7),
                period_end=now,
                data_context={
                    "total_boluses": 10,
                    "total_spikes": 3,
                    "meal_periods_data": [{"period": "breakfast"}],
                },
                model_info=ModelInfo(
                    model="claude-sonnet",
                    provider="anthropic",
                    input_tokens=300,
                    output_tokens=150,
                ),
                safety=SafetyInfo(
                    status="approved",
                    has_dangerous_content=False,
                    flagged_items=[],
                    validated_at=now,
                ),
                user_response=UserResponseInfo(
                    response="acknowledged",
                    reason="Very helpful",
                    responded_at=now,
                ),
            )

            with patch(
                "src.routers.insights.get_insight_detail",
                new_callable=AsyncMock,
                return_value=mock_detail,
            ):
                response = await client.get(
                    f"/api/ai/insights/meal_analysis/{analysis_id}",
                    cookies={settings.jwt_cookie_name: cookie},
                )

                assert response.status_code == 200
                data = response.json()
                assert data["analysis_type"] == "meal_analysis"
                assert data["status"] == "acknowledged"
                # Safety info serialized correctly
                assert data["safety"]["status"] == "approved"
                assert data["safety"]["has_dangerous_content"] is False
                assert data["safety"]["flagged_items"] == []
                assert "validated_at" in data["safety"]
                # User response serialized correctly
                assert data["user_response"]["response"] == "acknowledged"
                assert data["user_response"]["reason"] == "Very helpful"
                assert "responded_at" in data["user_response"]
