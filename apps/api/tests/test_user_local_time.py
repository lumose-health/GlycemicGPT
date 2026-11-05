"""Tests for the shared user-local time helpers."""

import uuid
from datetime import UTC, datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock
from zoneinfo import ZoneInfo

from sqlalchemy import select

from src.database import get_db_session
from src.models.brief_delivery_config import BriefDeliveryConfig
from src.models.user import User
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


def _db_returning(row):
    result = MagicMock()
    result.one_or_none.return_value = row
    db = AsyncMock()
    db.begin_nested = MagicMock(return_value=_SavepointContext())
    db.execute.return_value = result
    return db


class TestResolveUserTimezone:
    """Precedence: users.timezone, then a non-default brief zone, then UTC."""

    async def test_user_timezone_wins_over_brief(self):
        db = _db_returning(("Europe/London", "America/New_York"))
        assert await resolve_user_timezone(db, uuid.uuid4()) == "Europe/London"

    async def test_falls_back_to_non_default_brief_timezone(self):
        db = _db_returning((None, "America/New_York"))
        assert await resolve_user_timezone(db, uuid.uuid4()) == "America/New_York"

    async def test_default_utc_brief_timezone_is_not_a_choice(self):
        db = _db_returning((None, "UTC"))
        assert await resolve_user_timezone(db, uuid.uuid4()) is None

    async def test_nothing_set_returns_none(self):
        assert (
            await resolve_user_timezone(_db_returning((None, None)), uuid.uuid4())
            is None
        )
        assert await resolve_user_timezone(_db_returning(None), uuid.uuid4()) is None

    async def test_unloadable_user_timezone_falls_through_to_brief(self):
        db = _db_returning(("Not/AZone", "Asia/Tokyo"))
        assert await resolve_user_timezone(db, uuid.uuid4()) == "Asia/Tokyo"

    async def test_unloadable_brief_timezone_returns_none(self):
        db = _db_returning((None, "Not/AZone"))
        assert await resolve_user_timezone(db, uuid.uuid4()) is None

    async def test_query_error_returns_none(self):
        db = AsyncMock()
        db.begin_nested = MagicMock(return_value=_SavepointContext())
        db.execute.side_effect = RuntimeError("db down")

        assert await resolve_user_timezone(db, uuid.uuid4()) is None


class TestResolveUserTimezoneAgainstDb:
    """End-to-end precedence against the real tables."""

    async def _make_user(self, db, tz):
        user = User(
            email=f"tz_{uuid.uuid4().hex[:8]}@example.com",
            hashed_password="x",
            timezone=tz,
        )
        db.add(user)
        await db.flush()
        return user

    async def test_precedence_with_real_rows(self):
        async with get_db_session() as db:
            user = await self._make_user(db, None)
            assert await resolve_user_timezone(db, user.id) is None

            db.add(BriefDeliveryConfig(user_id=user.id, timezone="UTC"))
            await db.flush()
            assert await resolve_user_timezone(db, user.id) is None

            brief = (
                await db.execute(
                    select(BriefDeliveryConfig).where(
                        BriefDeliveryConfig.user_id == user.id
                    )
                )
            ).scalar_one()
            brief.timezone = "America/Chicago"
            await db.flush()
            assert await resolve_user_timezone(db, user.id) == "America/Chicago"

            user.timezone = "Europe/Berlin"
            await db.flush()
            assert await resolve_user_timezone(db, user.id) == "Europe/Berlin"

            await db.rollback()
