"""create_purchase_invoice_items

Revision ID: a1b2c3d4e5f6
Revises: d553ec7f687a
Create Date: 2026-06-29 11:37:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import sqlmodel


# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, Sequence[str], None] = 'd553ec7f687a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'purchase_invoice_items',
        sa.Column('id', sa.Integer(), primary_key=True, nullable=False),
        sa.Column('accounts_payable_id', sa.Integer(), nullable=False),
        sa.Column('purchase_order_item_id', sa.Integer(), nullable=True),
        sa.Column('material_id', sa.Integer(), nullable=True),
        sa.Column('description', sa.String(), nullable=True),
        sa.Column('sku', sa.String(), nullable=True),
        sa.Column('quantity_received', sa.Float(), nullable=False),
        sa.Column('unit_cost', sa.Float(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['accounts_payable_id'], ['accounts_payable.id']),
        sa.ForeignKeyConstraint(['purchase_order_item_id'], ['purchase_order_items.id']),
        sa.ForeignKeyConstraint(['material_id'], ['materials.id']),
    )
    op.create_index(
        op.f('ix_purchase_invoice_items_accounts_payable_id'),
        'purchase_invoice_items', ['accounts_payable_id'], unique=False
    )


def downgrade() -> None:
    op.drop_index(
        op.f('ix_purchase_invoice_items_accounts_payable_id'),
        table_name='purchase_invoice_items'
    )
    op.drop_table('purchase_invoice_items')
