"""Idempotency-key registry for user-authored create endpoints.

One row per successfully-processed keyed create: when a client retries a create
with the same ``Idempotency-Key`` header (e.g. the mobile offline outbox
replaying after a dropped response), the matching row lets the endpoint return
the original resource instead of inserting a duplicate. A double-inserted meal
would inflate carb -- and downstream IOB -- history, a dosing input, so replay
correctness here is safety-adjacent.

Deliberately DISTINCT from ``pump_events.dedupe_hash``: that is a
server-computed *content* hash that collapses two genuinely-distinct
submissions describing the same real-world event across sources. Request
idempotency is the opposite semantic -- it must return the same row for the
same retried *request* and must never merge two intentionally-distinct meals
that happen to look alike. The two mechanisms coexist and share nothing.

The row stores a POINTER to the created resource (type + id + status), never a
serialized response: replays re-fetch the live resource owner-scoped, so no
meal/carb data (health-adjacent) is duplicated here and a replay can never
return a stale snapshot.
"""

import uuid
from datetime import datetime

from sqlalchemy import (
    DateTime,
    ForeignKey,
    SmallInteger,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from src.models.base import Base


class IdempotencyKey(Base):
    """A processed (user, endpoint, client request id) create, with its result pointer."""

    __tablename__ = "idempotency_keys"

    __table_args__ = (
        # The correctness guarantee: two concurrent same-key creates can both
        # miss the pre-SELECT, but only one insert survives this constraint --
        # the loser catches IntegrityError and replays the winner.
        UniqueConstraint(
            "user_id",
            "endpoint",
            "client_request_id",
            name="uq_idempotency_keys_user_endpoint_client_request_id",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        server_default=func.gen_random_uuid(),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Stable endpoint slug (see services.idempotency), NOT the request path --
    # paths are fragile to trailing slashes and future versioning. The slug
    # dimension keeps the same client key from replaying across endpoints.
    endpoint: Mapped[str] = mapped_column(String(80), nullable=False)

    # The client-supplied Idempotency-Key header value, stored verbatim and
    # treated as opaque (the outbox sends a UUIDv4, but nothing here parses it).
    client_request_id: Mapped[str] = mapped_column(String(64), nullable=False)

    # --- Result pointer (never the response body) ---
    # Polymorphic soft reference: spans food_records / common_foods / future
    # create tables, so no hard FK. A replay re-fetches by (resource_id, owner)
    # at the call site, which knows its own response model.
    resource_type: Mapped[str] = mapped_column(String(40), nullable=False)
    resource_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    response_status: Mapped[int] = mapped_column(SmallInteger, nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    def __repr__(self) -> str:
        return (
            f"<IdempotencyKey(id={self.id}, user_id={self.user_id}, "
            f"endpoint={self.endpoint!r}, resource_type={self.resource_type!r}, "
            f"resource_id={self.resource_id})>"
        )
