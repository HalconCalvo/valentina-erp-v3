"""add street and lot to sales_order_item_instances

Revision ID: k7e8f9a0b1c2
Revises: j6d7e8f9a0b1
Create Date: 2026-08-12

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'k7e8f9a0b1c2'
down_revision = 'j6d7e8f9a0b1'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('sales_order_item_instances', sa.Column('street', sa.String(), nullable=True))
    op.add_column('sales_order_item_instances', sa.Column('lot', sa.String(), nullable=True))
    op.create_index(op.f('ix_sales_order_item_instances_street'), 'sales_order_item_instances', ['street'], unique=False)
    op.create_index(op.f('ix_sales_order_item_instances_lot'), 'sales_order_item_instances', ['lot'], unique=False)


def downgrade():
    op.drop_index(op.f('ix_sales_order_item_instances_lot'), table_name='sales_order_item_instances')
    op.drop_index(op.f('ix_sales_order_item_instances_street'), table_name='sales_order_item_instances')
    op.drop_column('sales_order_item_instances', 'lot')
    op.drop_column('sales_order_item_instances', 'street')
