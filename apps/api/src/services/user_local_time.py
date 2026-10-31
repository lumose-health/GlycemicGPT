"""User-local time helpers for time-of-day pattern analysis.

Pump event timestamps are stored in UTC, but meal windows and correction
time periods are local-day concepts. These helpers resolve the user's
timezone once (the per-user setting first, then the brief-delivery zone) and
convert each timestamp to a local hour, falling back to UTC whenever the
timezone is missing or unusable.
"""

from datetime import UTC, datetime
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.logging_config import get_logger
from src.models.brief_delivery_config import BriefDeliveryConfig
from src.models.user import User

logger = get_logger(__name__)


# The brief-delivery default. A brief config still on it says nothing about
# where the user is, so it does not count as a timezone choice.
_BRIEF_DEFAULT_TIMEZONE = "UTC"


def _usable(tz_name: str | None) -> bool:
    if not tz_name:
        return False
    try:
        ZoneInfo(tz_name)
    except (ValueError, ZoneInfoNotFoundError):
        return False
    return True


async def resolve_user_timezone(
    db: AsyncSession, user_id: "str | object"
) -> str | None:
    """Return the user's IANA timezone name for local-hour classification.

    Resolution order:

    1. ``users.timezone`` -- the per-user zone, filled from the browser or set
       in settings.
    2. ``BriefDeliveryConfig.timezone``, unless it is still the "UTC" default.
    3. ``None`` (callers treat this as UTC).

    A stored name that cannot be loaded is skipped in favour of the next
    source rather than ending resolution. The daily-brief scheduler does not
    use this; it keeps reading its own delivery timezone.

    The lookup runs inside a SAVEPOINT so a failed statement cannot abort
    the caller's transaction: statement errors are contained and ``None``
    is returned instead.
    """
    try:
        async with db.begin_nested():
            result = await db.execute(
                select(User.timezone, BriefDeliveryConfig.timezone)
                .outerjoin(
                    BriefDeliveryConfig,
                    BriefDeliveryConfig.user_id == User.id,
                )
                .where(User.id == user_id)
            )
            row = result.one_or_none()
    except Exception:
        logger.warning(
            "Failed to read user timezone",
            user_id=str(user_id),
            exc_info=True,
        )
        return None
    if row is None:
        return None
    user_tz, brief_tz = row
    if _usable(user_tz):
        return user_tz
    if brief_tz != _BRIEF_DEFAULT_TIMEZONE and _usable(brief_tz):
        return brief_tz
    return None


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
