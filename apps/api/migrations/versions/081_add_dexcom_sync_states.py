"""Add durable adaptive Dexcom polling state.

Revision ID: 081_add_dexcom_sync_states
Revises: 080_add_no_data_alert_type
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "081_add_dexcom_sync_states"
down_revision = "080_add_no_data_alert_type"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "dexcom_sync_states",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("latest_reading_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_attempt_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_success_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("next_poll_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("poll_phase_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("sync_lease_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("sync_lease_expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "unchanged_attempts", sa.Integer(), server_default="0", nullable=False
        ),
        sa.Column(
            "consecutive_failures", sa.Integer(), server_default="0", nullable=False
        ),
        sa.Column(
            "initial_backfill_complete",
            sa.Boolean(),
            server_default=sa.false(),
            nullable=False,
        ),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_dexcom_sync_states_user_id", "dexcom_sync_states", ["user_id"], unique=True
    )
    op.create_index(
        "ix_dexcom_sync_states_next_poll_at",
        "dexcom_sync_states",
        ["next_poll_at"],
        unique=False,
    )
    op.execute(
        """
        INSERT INTO dexcom_sync_states (
            id,
            user_id,
            next_poll_at,
            poll_phase_at
        )
        SELECT
            gen_random_uuid(),
            user_id,
            now() + (
                ((hashtextextended(user_id::text, 0) % 300 + 300) % 300)
                * interval '1 second'
            ),
            now()
        FROM integration_credentials
        WHERE integration_type = 'dexcom' AND status = 'connected'
        ON CONFLICT (user_id) DO NOTHING
        """
    )


def downgrade() -> None:
    op.drop_index("ix_dexcom_sync_states_next_poll_at", table_name="dexcom_sync_states")
    op.drop_index("ix_dexcom_sync_states_user_id", table_name="dexcom_sync_states")
    op.drop_table("dexcom_sync_states")
