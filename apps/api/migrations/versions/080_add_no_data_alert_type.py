"""Add no_data alert type (GLY-137).

Adds the 'no_data' value to the alerttype enum for the caregiver
"lost contact" / data-gap alert.

DELIBERATE divergence from the older enum-add migrations (028/036/052/
068/079): those run ``op.execute("COMMIT")`` before ALTER TYPE because
pre-PG12 forbade ADD VALUE inside a transaction block. On PG12+ (this
project's floor) ADD VALUE is transactional as long as the new value is
not USED in the same transaction -- and 'no_data' is only referenced at
runtime by the data-gap detector, never by a migration. The COMMIT hack
breaks alembic's transactional bookkeeping for everything after it in
the run, so per the GLY-137 review it is not repeated here; new enum-add
migrations should follow this form.

Revision ID: 080_add_no_data_alert_type
Revises: 079_add_copilot_subscription
"""

from alembic import op

revision = "080_add_no_data_alert_type"
down_revision = "079_add_copilot_subscription"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TYPE alerttype ADD VALUE IF NOT EXISTS 'no_data'")


def downgrade() -> None:
    # PostgreSQL cannot remove enum values. Delete rows referencing
    # 'no_data' so earlier revisions never encounter the unknown value.
    op.execute("DELETE FROM alerts WHERE alert_type = 'no_data'")
