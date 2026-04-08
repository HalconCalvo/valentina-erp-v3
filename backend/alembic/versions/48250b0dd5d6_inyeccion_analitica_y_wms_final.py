"""Inyeccion Analitica y WMS FINAL

Revision ID: 48250b0dd5d6
Revises: 527a4a8d2805
Create Date: 2026-04-04 19:35:29.416614

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import sqlmodel


# revision identifiers, used by Alembic.
revision: str = '48250b0dd5d6'
down_revision: Union[str, Sequence[str], None] = '527a4a8d2805'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('purchase_order_items', schema=None) as batch_op:
        batch_op.add_column(sa.Column('quantity_received', sa.Float(), server_default='0.0', nullable=False))

    with op.batch_alter_table('purchase_orders', schema=None) as batch_op:
        batch_op.add_column(sa.Column('exchange_rate', sa.Float(), nullable=True))

    with op.batch_alter_table('sales_order_item_instances', schema=None) as batch_op:
        batch_op.add_column(sa.Column('started_at', sa.DateTime(), nullable=True))
        batch_op.add_column(sa.Column('completed_at', sa.DateTime(), nullable=True))
        batch_op.add_column(sa.Column('qc_rejections_count', sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column('delivery_deadline', sa.DateTime(), nullable=True))
        batch_op.add_column(sa.Column('current_stage_deadline', sa.DateTime(), nullable=True))
        batch_op.add_column(sa.Column('signed_received_at', sa.DateTime(), nullable=True))
        batch_op.add_column(sa.Column('administration_invoice_folio', sqlmodel.sql.sqltypes.AutoString(), nullable=True))

    with op.batch_alter_table('sales_order_items', schema=None) as batch_op:
        batch_op.add_column(sa.Column('category_breakdown_snapshot', sqlmodel.sql.sqltypes.AutoString(), nullable=True))

    with op.batch_alter_table('sales_orders', schema=None) as batch_op:
        batch_op.add_column(sa.Column('exchange_rate', sa.Float(), nullable=True))
        batch_op.add_column(sa.Column('estimated_installation_cost', sa.Float(), nullable=True))
        batch_op.add_column(sa.Column('estimated_manufacturing_cost', sa.Float(), nullable=True))
        batch_op.add_column(sa.Column('requires_director_approval', sa.Boolean(), nullable=True))
        batch_op.add_column(sa.Column('is_approved_by_director', sa.Boolean(), nullable=True))
        batch_op.add_column(sa.Column('director_approved_at', sa.DateTime(), nullable=True))

def downgrade() -> None:
    pass