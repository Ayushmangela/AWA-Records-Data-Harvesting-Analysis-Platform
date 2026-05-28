"""alter_generated_at_to_timestamptz

Revision ID: fbd54be62496
Revises: 26134d57d77b
Create Date: 2026-05-28 13:06:13.278866

"""

from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "fbd54be62496"
down_revision: Union[str, Sequence[str], None] = "26134d57d77b"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Convert existing naive UTC timestamps to TIMESTAMPTZ.
    # The USING clause explicitly labels the stored value as UTC so Postgres
    # stores it correctly as a tz-aware timestamp.
    op.execute("""
        ALTER TABLE ai_summaries
        ALTER COLUMN generated_at TYPE TIMESTAMPTZ
        USING generated_at AT TIME ZONE 'UTC'
    """)
    op.execute("""
        ALTER TABLE legal_memos
        ALTER COLUMN generated_at TYPE TIMESTAMPTZ
        USING generated_at AT TIME ZONE 'UTC'
    """)


def downgrade() -> None:
    # Strip timezone info back to a naive TIMESTAMP (loses tzinfo).
    op.execute("""
        ALTER TABLE ai_summaries
        ALTER COLUMN generated_at TYPE TIMESTAMP
        USING generated_at AT TIME ZONE 'UTC'
    """)
    op.execute("""
        ALTER TABLE legal_memos
        ALTER COLUMN generated_at TYPE TIMESTAMP
        USING generated_at AT TIME ZONE 'UTC'
    """)
