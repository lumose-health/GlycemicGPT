"""Tests for the shared user-local time helpers."""

import uuid
from datetime import UTC, datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock
from zoneinfo import ZoneInfo

from src.services.user_local_time import (
    load_user_zone,
    local_hour,
    resolve_user_timezone,
)


class _SavepointContext:
    """Async context manager standing in for ``db.begin_nested()`` on a mock."""

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc_info):
        return False


class TestLocalHour:
    def test_converts_to_user_zone_with_dst(self):
        tz = ZoneInfo("America/New_York")
        assert local_hour(datetime(2026, 7, 7, 14, 36, tzinfo=UTC), tz) == 10
        assert local_hour(datetime(2026, 1, 7, 14, 36, tzinfo=UTC), tz) == 9

    def test_no_zone_normalizes_aware_timestamp_to_utc(self):
        ts = datetime(2026, 2, 7, 14, 36, tzinfo=timezone(timedelta(hours=4)))
        assert local_hour(ts, None) == 10

    def test_naive_timestamp_treated_as_utc(self):
        assert local_hour(datetime(2026, 2, 7, 7, 0), None) == 7
        tz = ZoneInfo("America/New_York")
        assert local_hour(datetime(2026, 2, 7, 7, 0), tz) == 2


class TestLoadUserZone:
    def test_valid_name(self):
        assert load_user_zone("Europe/London", uuid.uuid4()) == ZoneInfo(
            "Europe/London"
        )

    def test_missing_or_invalid_name_means_utc(self):
        assert load_user_zone(None, uuid.uuid4()) is None
        assert load_user_zone("", uuid.uuid4()) is None
        assert load_user_zone("Not/AZone", uuid.uuid4()) is None
        assert load_user_zone("../../etc/passwd", uuid.uuid4()) is None


class TestResolveUserTimezone:
    async def test_returns_configured_name(self):
        result = MagicMock()
        result.scalar_one_or_none.return_value = "America/New_York"
        db = AsyncMock()
        db.begin_nested = MagicMock(return_value=_SavepointContext())
        db.execute.return_value = result

        assert await resolve_user_timezone(db, uuid.uuid4()) == "America/New_York"

    async def test_no_config_returns_none(self):
        result = MagicMock()
        result.scalar_one_or_none.return_value = None
        db = AsyncMock()
        db.begin_nested = MagicMock(return_value=_SavepointContext())
        db.execute.return_value = result

        assert await resolve_user_timezone(db, uuid.uuid4()) is None

    async def test_query_error_returns_none(self):
        db = AsyncMock()
        db.begin_nested = MagicMock(return_value=_SavepointContext())
        db.execute.side_effect = RuntimeError("db down")

        assert await resolve_user_timezone(db, uuid.uuid4()) is None
