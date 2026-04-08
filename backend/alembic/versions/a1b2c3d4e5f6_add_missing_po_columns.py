"""add_missing_po_columns

Revision ID: a1b2c3d4e5f6
Revises: f27fb3fb368d
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, Sequence[str], None] = 'f27fb3fb368d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def upgrade() -> None:
    # Agregamos las 3 columnas faltantes a la tabla de órdenes de compra
    with op.batch_alter_table('purchase_orders', schema=None) as batch_op:
        batch_op.add_column(sa.Column('invoice_folio_reported', sa.String(), nullable=True))
        batch_op.add_column(sa.Column('invoice_total_reported', sa.Float(), nullable=True))
        batch_op.add_column(sa.Column('authorized_by', sa.String(), nullable=True))

def downgrade() -> None:
    pass