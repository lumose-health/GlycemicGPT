"""Add the central idempotency_keys registry for user-authored creates.

WHY: the mobile offline outbox (Epic 57 Phase 2) replays a create when the
response was dropped -- including the indeterminate-commit case where the row
DID land server-side. Without a request-identity check, that replay
double-inserts the meal, inflating carb (and downstream IOB) history, a dosing
input. This table records each processed (user, endpoint, client_request_id)
create with a pointer to the created resource, so a retry returns the original
row instead of inserting a duplicate.

Deliberately coexists with -- and must never be conflated with --
``pump_events.dedupe_hash``: that is a server-computed CONTENT hash collapsing
distinct submissions of the same real-world event across sources. Request
idempotency is the opposite semantic: same retried request -> same row, but two
identical-looking meals a minute apart are both real and must both persist.

Stores resource_type + resource_id + response_status only -- never a serialized
response body -- so no meal/carb data is duplicated into this table. No
backfill: rows exist only for requests that carried the (new, optional)
Idempotency-Key header.

Revision ID: 078_idempotency_keys
Revises: 077_meal_intelligence_enabled
Create Date: 2026-07-02
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision: str = "078_idempotency_keys"
down_revision: str | None = "077_meal_intelligence_enabled"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "idempotency_keys",
        sa.Column(
            "id",
            UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("user_id", UUID(as_uuid=True), nullable=False),
        sa.Column("endpoint", sa.String(length=80), nullable=False),
        sa.Column("client_request_id", sa.String(length=64), nullable=False),
        sa.Column("resource_type", sa.String(length=40), nullable=False),
        # Polymorphic soft reference (spans food_records / common_foods /
        # future create tables) -- intentionally no FK.
        sa.Column("resource_id", UUID(as_uuid=True), nullable=False),
        sa.Column("response_status", sa.SmallInteger(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        # The correctness guarantee for concurrent same-key creates: the loser
        # of the race hits this constraint and replays the winner's resource.
        sa.UniqueConstraint(
            "user_id",
            "endpoint",
            "client_request_id",
            name="uq_idempotency_keys_user_endpoint_client_request_id",
        ),
    )
    op.create_index("ix_idempotency_keys_user_id", "idempotency_keys", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_idempotency_keys_user_id", table_name="idempotency_keys")
    op.drop_table("idempotency_keys")
