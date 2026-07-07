"""Add copilot_subscription AI provider type.

Adds the 'copilot_subscription' value to the aiprovidertype enum for the
GitHub Copilot SDK subscription provider, routed through the managed sidecar
like claude_subscription / chatgpt_subscription.

Revision ID: 079_add_copilot_subscription
Revises: 078_idempotency_keys
"""

from alembic import op

revision = "079_add_copilot_subscription"
down_revision = "078_idempotency_keys"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add the new enum value - must run outside transaction for PostgreSQL
    # ALTER TYPE ... ADD VALUE IF NOT EXISTS is non-transactional
    op.execute("COMMIT")
    op.execute(
        "ALTER TYPE aiprovidertype ADD VALUE IF NOT EXISTS 'copilot_subscription'"
    )


def downgrade() -> None:
    # PostgreSQL cannot remove enum values. Any rows referencing
    # 'copilot_subscription' must be reassigned before downgrading further,
    # matching the note in migration 028_expand_ai_provider_types.
    op.execute(
        "DELETE FROM ai_provider_configs WHERE provider_type = 'copilot_subscription'"
    )
