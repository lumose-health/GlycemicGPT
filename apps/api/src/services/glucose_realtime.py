"""Redis fanout for committed glucose and alert updates."""

import asyncio
import json
import uuid
from datetime import datetime
from typing import Any

import redis.asyncio as aioredis

from src.config import settings
from src.logging_config import get_logger

logger = get_logger(__name__)
_redis_client: aioredis.Redis | None = None


def get_realtime_redis() -> aioredis.Redis:
    global _redis_client
    if _redis_client is None:
        _redis_client = aioredis.from_url(
            settings.redis_url,
            encoding="utf-8",
            decode_responses=True,
            socket_connect_timeout=1,
            socket_timeout=2,
        )
    return _redis_client


def glucose_channel(user_id: uuid.UUID | str) -> str:
    return f"glucose:updates:{user_id}"


async def publish_glucose_update(
    user_id: uuid.UUID | str, reading_timestamp: datetime
) -> None:
    """Publish only timing metadata. Glucose values remain in PostgreSQL."""

    if settings.testing:
        return
    try:
        await get_realtime_redis().publish(
            glucose_channel(user_id),
            json.dumps({"reading_timestamp": reading_timestamp.isoformat()}),
        )
    except aioredis.RedisError:
        logger.warning("Redis glucose publication unavailable", user_id=str(user_id))


async def publish_alert_update(
    user_id: uuid.UUID | str, alert_ids: list[uuid.UUID]
) -> None:
    """Wake live clients after alerts commit without putting medical data in Redis."""

    if settings.testing or not alert_ids:
        return
    try:
        await get_realtime_redis().publish(
            glucose_channel(user_id),
            json.dumps({"alert_ids": [str(alert_id) for alert_id in alert_ids]}),
        )
    except aioredis.RedisError:
        logger.warning("Redis alert publication unavailable", user_id=str(user_id))


class GlucoseUpdateListener:
    """One user-update subscription per SSE connection with a timed fallback."""

    def __init__(self, user_id: uuid.UUID | str) -> None:
        self.user_id = user_id
        self.pubsub: Any | None = None

    async def start(self) -> None:
        if settings.testing:
            return
        try:
            self.pubsub = get_realtime_redis().pubsub()
            await self.pubsub.subscribe(glucose_channel(self.user_id))
        except aioredis.RedisError:
            self.pubsub = None
            logger.warning(
                "Redis glucose subscription unavailable", user_id=str(self.user_id)
            )

    async def wait(self, timeout_seconds: float) -> bool:
        if self.pubsub is None:
            await asyncio.sleep(timeout_seconds)
            return False
        try:
            message = await self.pubsub.get_message(
                ignore_subscribe_messages=True, timeout=timeout_seconds
            )
            return message is not None
        except aioredis.RedisError:
            self.pubsub = None
            await asyncio.sleep(timeout_seconds)
            return False

    async def close(self) -> None:
        if self.pubsub is not None:
            await self.pubsub.aclose()
            self.pubsub = None
