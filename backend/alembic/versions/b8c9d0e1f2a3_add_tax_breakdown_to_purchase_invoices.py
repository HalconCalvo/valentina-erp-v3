"""add_tax_breakdown_to_purchase_invoices

Revision ID: b8c9d0e1f2a3
Revises: a7b8c9d0e1f2
Create Date: 2026-07-20 17:43:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'b8c9d0e1f2a3'
down_revision: Union[str, Sequence[str], None] = 'a7b8c9d0e1f2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('purchase_invoices', sa.Column('subtotal', sa.Float(), nullable=False, server_default='0'))
    op.add_column('purchase_invoices', sa.Column('tax_rate', sa.Float(), nullable=False, server_default='0.16'))
    op.add_column('purchase_invoices', sa.Column('tax_amount', sa.Float(), nullable=False, server_default='0'))
    op.add_column('purchase_invoices', sa.Column('accounts_payable_id', sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column('purchase_invoices', 'accounts_payable_id')
    op.drop_column('purchase_invoices', 'tax_amount')
    op.drop_column('purchase_invoices', 'tax_rate')
    op.drop_column('purchase_invoices', 'subtotal')
