"""IANA timezone name validation for user-settable timezone fields.

``ZoneInfo(name)`` alone is too permissive for a value a user can write: it
resolves names like ``localtime`` or ``posix/Europe/London`` straight off the
host filesystem. A user timezone must instead be one of the canonical tz
database keys, so validation checks membership in
``zoneinfo.available_timezones()``. That set never contains absolute paths,
``..`` segments or filesystem-only entries, so a name that passes cannot be
used to probe the host.
"""

import zoneinfo
from functools import lru_cache

# Upper bound on a stored name. The longest tz database key is ~32 characters;
# the column is String(64).
MAX_TIMEZONE_LENGTH = 64

# Present in the tz database but not real regional zones: ``localtime`` is the
# host's own zone and ``Factory`` is a placeholder that renders as "-00".
_EXCLUDED_ZONES = frozenset({"localtime", "Factory"})


@lru_cache(maxsize=1)
def _allowed_timezones() -> frozenset[str]:
    return frozenset(zoneinfo.available_timezones() - _EXCLUDED_ZONES)


def is_valid_iana_timezone(name: str) -> bool:
    """Return True when ``name`` is a canonical, loadable IANA timezone key."""
    if not name or len(name) > MAX_TIMEZONE_LENGTH:
        return False
    if name not in _allowed_timezones():
        return False
    try:
        zoneinfo.ZoneInfo(name)
    except (ValueError, zoneinfo.ZoneInfoNotFoundError):
        return False
    return True
