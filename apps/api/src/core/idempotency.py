"""Optional ``Idempotency-Key`` request-header dependency.

Transport seam for request idempotency on user-authored creates (Epic 57
Phase 2): the mobile offline outbox stamps each queued create with a stable
client request id and retries with the same value, so a dropped response can
never double-insert. The header is OPTIONAL -- callers that don't send it (web,
Wear relay, older app builds) get the unchanged non-idempotent behavior.

A header (not a body field) because the primary create, ``POST
/api/food-records``, is multipart with no JSON body -- and a header keeps the
token orthogonal to every DTO. Deliberately NOT ``X-Correlation-ID``: that is
regenerated server-side per request, so it cannot survive a retry as a stable
key.
"""

from typing import Annotated

from fastapi import Depends, Header, HTTPException, status

IDEMPOTENCY_KEY_HEADER = "Idempotency-Key"

# Response header marking a keyed create that was served by replaying the
# already-created resource instead of inserting a new one (observability;
# never required for client correctness).
IDEMPOTENT_REPLAYED_HEADER = "Idempotent-Replayed"

# The outbox sends a canonical lowercase UUIDv4 (36 chars); the value is
# treated as opaque, so the bound is a defensive cap on stored size, not a
# format check.
MAX_IDEMPOTENCY_KEY_LENGTH = 64


async def get_idempotency_key(
    idempotency_key: Annotated[str | None, Header(alias=IDEMPOTENCY_KEY_HEADER)] = None,
) -> str | None:
    """Validate the optional ``Idempotency-Key`` header and return its value.

    Absent header -> ``None`` (the endpoint behaves as a normal, non-idempotent
    create). A present-but-unusable value (blank or oversized) is a client bug
    in key generation, and silently ignoring it would drop the exactly-once
    guarantee the client asked for -- so it fails loud with a 422.
    """
    if idempotency_key is None:
        return None
    key = idempotency_key.strip()
    if not key:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Idempotency-Key header must not be empty.",
        )
    if len(key) > MAX_IDEMPOTENCY_KEY_LENGTH:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                "Idempotency-Key header must be at most "
                f"{MAX_IDEMPOTENCY_KEY_LENGTH} characters."
            ),
        )
    return key


# Alias mirroring the DiabeticOrAdminUser idiom (core.auth): annotate a route
# parameter with this to receive the validated key (or None when not sent).
IdempotencyKeyHeader = Annotated[str | None, Depends(get_idempotency_key)]
