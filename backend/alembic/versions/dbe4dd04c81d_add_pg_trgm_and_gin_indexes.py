"""add pg_trgm and gin indexes

Revision ID: dbe4dd04c81d
Revises: d63463cb009b
Create Date: 2026-05-28 11:34:56.448780

"""

from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "dbe4dd04c81d"
down_revision: Union[str, Sequence[str], None] = "d63463cb009b"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_facilities_name_trgm ON facilities USING gin (name gin_trgm_ops)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_violations_description_trgm ON violations USING gin (description gin_trgm_ops)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_inventory_scientific_trgm ON inventory USING gin (scientific_name gin_trgm_ops)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_inventory_common_trgm ON inventory USING gin (common_name gin_trgm_ops)"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_inventory_common_trgm")
    op.execute("DROP INDEX IF EXISTS ix_inventory_scientific_trgm")
    op.execute("DROP INDEX IF EXISTS ix_violations_description_trgm")
    op.execute("DROP INDEX IF EXISTS ix_facilities_name_trgm")
    op.execute("DROP EXTENSION IF EXISTS pg_trgm")
