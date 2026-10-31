"""Add external_account_id to integration_credentials.

Pins a credential to a specific remote account/connection. Introduced for the
native LibreLinkUp connector: a follower can have more than one (or a changing
set of) sharing connections, and without a pinned identity a sync could
silently switch whose glucose is ingested under the same user. Nullable, so
existing rows and other integrations are unaffected until they set it.

Revision ID: 085_add_integration_external_id
Revises: 084_add_librelinkup_type
"""

import sqlalchemy as sa

from alembic import op

revision = "085_add_integration_external_id"
down_revision = "084_add_librelinkup_type"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "integration_credentials",
        sa.Column("external_account_id", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("integration_credentials", "external_account_id")
