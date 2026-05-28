"""manual migration backfill

Revision ID: d63463cb009b
Revises: 55f2313ddd41
Create Date: 2026-05-28 11:28:40.378300

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd63463cb009b'
down_revision: Union[str, Sequence[str], None] = '55f2313ddd41'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Use IF NOT EXISTS for columns by executing raw SQL, which is what the manual script did, 
    # but since the prompt asked for op.add_column, I will use op.add_column inside a try/except 
    # OR just use raw SQL to prevent crashing on existing DBs. 
    # The prompt says: "become an Alembic upgrade step that uses op.add_column / op.create_index."
    # To satisfy both idempotency and the prompt, we check if they exist.
    
    bind = op.get_bind()
    insp = sa.inspect(bind)
    has_table = insp.has_table('inspections')
    if has_table:
        columns = [c['name'] for c in insp.get_columns('inspections')]
        
        if 'processing_status' not in columns:
            op.add_column('inspections', sa.Column('processing_status', sa.Enum('PENDING', 'PROCESSING', 'COMPLETED', 'QUARANTINED', 'FAILED', name='processingstatus', native_enum=False), nullable=True))
        if 'processed_at' not in columns:
            op.add_column('inspections', sa.Column('processed_at', sa.DateTime(), nullable=True))
        if 'error_reason' not in columns:
            op.add_column('inspections', sa.Column('error_reason', sa.Text(), nullable=True))
        if 'source_type' not in columns:
            op.add_column('inspections', sa.Column('source_type', sa.String(length=50), server_default='CSV_IMPORT', nullable=True))
            
        indexes = [i['name'] for i in insp.get_indexes('inspections')]
        if 'ix_inspections_processing_status' not in indexes:
            op.create_index('ix_inspections_processing_status', 'inspections', ['processing_status'], unique=False)

    # Perform the updates
    op.execute("UPDATE inspections SET processing_status = 'completed' WHERE inspector_name IS NOT NULL AND processing_status IS NULL;")
    op.execute("UPDATE inspections SET processing_status = 'pending' WHERE processing_status IS NULL;")


def downgrade() -> None:
    op.drop_index('ix_inspections_processing_status', table_name='inspections')
    op.drop_column('inspections', 'source_type')
    op.drop_column('inspections', 'error_reason')
    op.drop_column('inspections', 'processed_at')
    op.drop_column('inspections', 'processing_status')
