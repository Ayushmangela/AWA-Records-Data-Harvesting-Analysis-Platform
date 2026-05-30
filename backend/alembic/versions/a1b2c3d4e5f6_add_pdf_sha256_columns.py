"""add_pdf_sha256_columns

Revision ID: a1b2c3d4e5f6
Revises: 30d8865782a6
Create Date: 2026-05-29 20:54:10.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, Sequence[str], None] = '30d8865782a6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('inspections', sa.Column('pdf_sha256', sa.String(length=64), nullable=True))
    op.add_column('enforcement_actions', sa.Column('pdf_sha256', sa.String(length=64), nullable=True))


def downgrade() -> None:
    op.drop_column('inspections', 'pdf_sha256')
    op.drop_column('enforcement_actions', 'pdf_sha256')
