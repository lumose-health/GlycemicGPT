"""Tests for Redis glucose update fanout."""

import json
import uuid
from datetime import UTC, datetime
from unittest.mock import AsyncMock

from src.config import settings
from src.services import glucose_realtime


async def test_publish_sends_only_reading_timing_metadata(monkeypatch) -> None:
    redis = AsyncMock()
    monkeypatch.setattr(settings, "testing", False)
    monkeypatch.setattr(glucose_realtime, "get_realtime_redis", lambda: redis)
    user_id = uuid.uuid4()
    reading_at = datetime(2026, 8, 11, 12, 0, tzinfo=UTC)

    await glucose_realtime.publish_glucose_update(user_id, reading_at)

    channel, raw_payload = redis.publish.await_args.args
    assert channel == f"glucose:updates:{user_id}"
    assert json.loads(raw_payload) == {"reading_timestamp": reading_at.isoformat()}


async def test_publish_alert_update_wakes_the_same_user_stream(monkeypatch) -> None:
    redis = AsyncMock()
    monkeypatch.setattr(settings, "testing", False)
    monkeypatch.setattr(glucose_realtime, "get_realtime_redis", lambda: redis)
    user_id = uuid.uuid4()
    alert_ids = [uuid.uuid4(), uuid.uuid4()]

    await glucose_realtime.publish_alert_update(user_id, alert_ids)

    channel, raw_payload = redis.publish.await_args.args
    assert channel == f"glucose:updates:{user_id}"
    assert json.loads(raw_payload) == {
        "alert_ids": [str(alert_id) for alert_id in alert_ids]
    }
