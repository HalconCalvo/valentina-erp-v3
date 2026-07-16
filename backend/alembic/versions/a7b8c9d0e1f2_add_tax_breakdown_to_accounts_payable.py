"""add_tax_breakdown_to_accounts_payable

Revision ID: a7b8c9d0e1f2
Revises: f6a7b8c9d0e1
Create Date: 2026-07-16 12:36:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'a7b8c9d0e1f2'
down_revision: Union[str, Sequence[str], None] = 'f6a7b8c9d0e1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('accounts_payable', sa.Column('subtotal', sa.Float(), nullable=False, server_default='0'))
    op.add_column('accounts_payable', sa.Column('tax_rate', sa.Float(), nullable=False, server_default='0.16'))
    op.add_column('accounts_payable', sa.Column('tax_amount', sa.Float(), nullable=False, server_default='0'))


def downgrade() -> None:
    op.drop_column('accounts_payable', 'tax_amount')
    op.drop_column('accounts_payable', 'tax_rate')
    op.drop_column('accounts_payable', 'subtotal')
