"""cleanup bad inspector_id

Revision ID: 26134d57d77b
Revises: dbe4dd04c81d
Create Date: 2026-05-28 12:22:21.899375

"""

from typing import Sequence, Union

from sqlalchemy.sql import text

from alembic import op
from app.services.wordlist import TOP_1000_WORDS

# revision identifiers, used by Alembic.
revision: str = "26134d57d77b"
down_revision: Union[str, Sequence[str], None] = "dbe4dd04c81d"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Build a comma-separated list of values for the IN clause
    bind_params = {f"word_{i}": word for i, word in enumerate(TOP_1000_WORDS)}
    in_clause = ", ".join(f":{key}" for key in bind_params.keys())

    op.execute(
        text(
            f"UPDATE inspections SET inspector_id = NULL WHERE inspector_id IN ({in_clause})"
        ).bindparams(**bind_params)
    )


def downgrade() -> None:
    # No realistic downgrade path for this data migration
    pass
