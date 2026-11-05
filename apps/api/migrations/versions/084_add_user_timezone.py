"""Add timezone column to users (one IANA timezone per user).

Time-of-day analysis (meal windows, correction time periods) needs the user's
local timezone. Until now the only per-user zone was the daily-brief delivery
setting, which defaults to UTC and is never filled from the browser. This adds a
user-level IANA name that the web app fills once from the browser and the user
can edit in settings.

The column is nullable with no default: NULL means "not set yet", and readers
fall back to the brief-delivery timezone and then UTC. Nothing is backfilled
from the brief config here; the fallback covers existing users.

Revision ID: 084_add_user_timezone
Revises: 083_add_user_token_version
Create Date: 2026-10-30
"""

import sqlalchemy as sa
from alembic import op

revision = "084_add_user_timezone"
down_revision = "083_add_user_token_version"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("timezone", sa.String(length=64), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("users", "timezone")
