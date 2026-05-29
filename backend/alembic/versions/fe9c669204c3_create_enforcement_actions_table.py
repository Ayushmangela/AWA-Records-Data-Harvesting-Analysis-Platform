"""create_enforcement_actions_table

Revision ID: fe9c669204c3
Revises: e791e28031ed
Create Date: 2026-05-29 15:05:15.930335

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'fe9c669204c3'
down_revision: Union[str, Sequence[str], None] = 'e791e28031ed'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create enforcement_actions table
    op.create_table(
        'enforcement_actions',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('facility_id', sa.Integer(), nullable=True),
        sa.Column('certificate', sa.String(), nullable=True),
        sa.Column('action_type', sa.String(), nullable=False),
        sa.Column('action_date', sa.Date(), nullable=False),
        sa.Column('outcome', sa.String(), nullable=True),
        sa.Column('penalty_amount', sa.Float(), nullable=True),
        sa.Column('source_pdf', sa.String(), nullable=True),
        sa.Column('source_pdf_path', sa.String(), nullable=True),
        sa.Column('summary', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.ForeignKeyConstraint(['facility_id'], ['facilities.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    # Create indexes
    op.create_index('ix_enforcement_actions_id', 'enforcement_actions', ['id'], unique=False)
    op.create_index('ix_enforcement_actions_facility_id', 'enforcement_actions', ['facility_id'], unique=False)
    op.create_index('ix_enforcement_actions_certificate', 'enforcement_actions', ['certificate'], unique=False)
    op.create_index('ix_enforcement_actions_source_pdf_path', 'enforcement_actions', ['source_pdf_path'], unique=False)


def downgrade() -> None:
    # Drop indexes
    op.drop_index('ix_enforcement_actions_source_pdf_path', table_name='enforcement_actions')
    op.drop_index('ix_enforcement_actions_certificate', table_name='enforcement_actions')
    op.drop_index('ix_enforcement_actions_facility_id', table_name='enforcement_actions')
    op.drop_index('ix_enforcement_actions_id', table_name='enforcement_actions')
    # Drop table
    op.drop_table('enforcement_actions')

