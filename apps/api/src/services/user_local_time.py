"""User-local time helpers for time-of-day pattern analysis.

Pump event timestamps are stored in UTC, but meal windows and correction
time periods are local-day concepts. These helpers resolve the user's
timezone once and convert each timestamp to a local hour, falling back to
UTC whenever the timezone is missing or unusable.
"""

from datetime import UTC, datetime
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.logging_config import get_logger
from src.models.brief_delivery_config import BriefDeliveryConfig

logger = get_logger(__name__)


async def resolve_user_timezone(
    db: AsyncSession, user_id: "str | object"
) -> str | None:
    """Return the user's IANA timezone name for local-hour classification.

    Reads the canonical per-user timezone from ``BriefDeliveryConfig`` (the
    same source the daily-brief scheduler uses for local-day math). Returns
    ``None`` when the user has no brief config. The stored name is validated
    on write by the brief-delivery schema; callers still guard it with
    ``load_user_zone`` and fall back to UTC on an invalid name.

    The lookup runs inside a SAVEPOINT so a failed statement cannot abort
    the caller's transaction: statement errors are contained and ``None``
    is returned instead.
    """
    try:
        async with db.begin_nested():
            result = await db.execute(
                select(BriefDeliveryConfig.timezone).where(
                    BriefDeliveryConfig.user_id == user_id
                )
            )
            tz_name = result.scalar_one_or_none()
    except Exception:
        logger.warning(
            "Failed to read user timezone",
            user_id=str(user_id),
            exc_info=True,
        )
        return None
    return tz_name or None


def load_user_zone(tz_name: str | None, user_id: "str | object") -> ZoneInfo | None:
    """Parse an IANA timezone name, returning ``None`` (UTC) when unusable.

    An invalid name is logged and ignored rather than failing the analysis.
    """
    if not tz_name:
        return None
    try:
        return ZoneInfo(tz_name)
    except (ValueError, ZoneInfoNotFoundError):
        logger.warning(
            "Invalid user timezone, using UTC",
            user_id=str(user_id),
            tz=tz_name,
        )
        return None


def local_hour(ts: datetime, tz: ZoneInfo | None) -> int:
    """Hour of day for time-period classification in the user's timezone.

    ``ts`` is tz-aware in normal operation (``DateTime(timezone=True)``); a
    naive value is treated as UTC defensively so classification can't raise.
    With no timezone configured, classification stays in UTC (legacy behavior):
    aware timestamps are normalized to UTC before the hour is read.
    """
    if ts.tzinfo is None:
        ts = ts.replace(tzinfo=UTC)
    return ts.astimezone(tz if tz is not None else UTC).hour
