"""Add librelinkup integration type.

Adds the 'librelinkup' value to the integrationtype enum for the native
FreeStyle Libre ingestion path via the LibreLinkUp follower cloud
(pylibrelinkup). This replaces the Nightscout relay hop for Libre users;
'dexcom' and 'tandem' were baked into the original CREATE TYPE in migration
004.

Follows the modern no-COMMIT-hack enum-add form documented in
080_add_no_data_alert_type: on PG12+ ``ALTER TYPE ... ADD VALUE`` is
transactional as long as the new value is not USED in the same transaction,
and 'librelinkup' is only referenced at runtime by the sync service, never by
a migration.

Revision ID: 084_add_librelinkup_type
Revises: 083_add_user_token_version

Note: the revision id must fit alembic_version.version_num (varchar(32)), so
it is deliberately shorter than the descriptive filename.
"""

from alembic import op

revision = "084_add_librelinkup_type"
down_revision = "083_add_user_token_version"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "ALTER TYPE integrationtype ADD VALUE IF NOT EXISTS 'librelinkup'"
    )


def downgrade() -> None:
    # PostgreSQL cannot remove enum values. Delete credentials referencing
    # 'librelinkup' so earlier revisions never encounter the unknown value.
    op.execute(
        "DELETE FROM integration_credentials WHERE integration_type = 'librelinkup'"
    )
