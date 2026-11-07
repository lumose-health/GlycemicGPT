"""Persist whether a daily brief's basal estimate is complete.

Revision ID: 085_brief_basal_complete
Revises: 084_add_user_timezone
Create Date: 2026-11-07
"""

import sqlalchemy as sa
from alembic import op

revision = "085_brief_basal_complete"
down_revision = "084_add_user_timezone"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "daily_briefs",
        sa.Column(
            "basal_estimate_complete",
            sa.Boolean(),
            nullable=False,
            server_default=sa.true(),
        ),
    )


def downgrade() -> None:
    op.drop_column("daily_briefs", "basal_estimate_complete")
