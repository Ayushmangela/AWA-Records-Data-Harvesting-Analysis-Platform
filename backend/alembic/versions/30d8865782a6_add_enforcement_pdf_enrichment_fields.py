"""add_enforcement_pdf_enrichment_fields

Revision ID: 30d8865782a6
Revises: fe9c669204c3
Create Date: 2026-05-29 15:34:43.765844

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '30d8865782a6'
down_revision: Union[str, Sequence[str], None] = 'fe9c669204c3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add columns to enforcement_actions
    op.add_column('enforcement_actions', sa.Column('pdf_downloaded', sa.Boolean(), server_default='false', nullable=False))
    op.add_column('enforcement_actions', sa.Column('pdf_processed', sa.Boolean(), server_default='false', nullable=False))
    op.add_column('enforcement_actions', sa.Column('ocr_status', sa.String(), server_default='pending', nullable=True))
    op.add_column('enforcement_actions', sa.Column('extracted_text', sa.Text(), nullable=True))
    
    # Create index for ocr_status
    op.create_index('ix_enforcement_actions_ocr_status', 'enforcement_actions', ['ocr_status'], unique=False)


def downgrade() -> None:
    # Drop index for ocr_status
    op.drop_index('ix_enforcement_actions_ocr_status', table_name='enforcement_actions')
    
    # Drop columns
    op.drop_column('enforcement_actions', 'extracted_text')
    op.drop_column('enforcement_actions', 'ocr_status')
    op.drop_column('enforcement_actions', 'pdf_processed')
    op.drop_column('enforcement_actions', 'pdf_downloaded')
