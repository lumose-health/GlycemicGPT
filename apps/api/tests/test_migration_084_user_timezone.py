"""Migration 084: nullable ``users.timezone`` column, with a working downgrade.

The upgrade/downgrade pair is rendered in Alembic offline (SQL) mode so the
test never mutates the shared dev database; the parity test then checks the
migrated table actually carries the column the model declares.
"""

import importlib.util
import io
from pathlib import Path

from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import text

from src.database import get_db_session
from src.models.user import User

_MIGRATION = (
    Path(__file__).resolve().parents[1]
    / "migrations"
    / "versions"
    / "084_add_user_timezone.py"
)


def _load_migration():
    spec = importlib.util.spec_from_file_location("migration_084", _MIGRATION)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _render(fn_name: str) -> str:
    """Run the migration step against an offline context and return its SQL."""
    module = _load_migration()
    buf = io.StringIO()
    ctx = MigrationContext.configure(
        dialect_name="postgresql",
        opts={"as_sql": True, "output_buffer": buf},
    )
    with Operations.context(ctx):
        getattr(module, fn_name)()
    return buf.getvalue()


def test_chains_onto_previous_head():
    module = _load_migration()
    assert module.revision == "084_add_user_timezone"
    assert module.down_revision == "083_add_user_token_version"


def test_upgrade_adds_nullable_column_without_backfill():
    sql = _render("upgrade")
    assert "ALTER TABLE users ADD COLUMN timezone VARCHAR(64)" in sql
    assert "NOT NULL" not in sql
    assert "DEFAULT" not in sql
    assert "UPDATE" not in sql.upper()


def test_downgrade_drops_column():
    sql = _render("downgrade")
    assert "ALTER TABLE users DROP COLUMN timezone" in sql


def test_model_matches_migration():
    column = User.__table__.c.timezone
    assert column.nullable is True
    assert column.type.length == 64


async def test_migrated_table_has_nullable_timezone_column():
    async with get_db_session() as db:
        row = (
            await db.execute(
                text(
                    "SELECT data_type, is_nullable, character_maximum_length "
                    "FROM information_schema.columns "
                    "WHERE table_name = 'users' AND column_name = 'timezone'"
                )
            )
        ).one_or_none()
    assert row == ("character varying", "YES", 64)
