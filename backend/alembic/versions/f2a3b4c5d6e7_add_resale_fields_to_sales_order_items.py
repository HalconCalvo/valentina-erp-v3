"""add_resale_fields_to_sales_order_items

Revision ID: f2a3b4c5d6e7
Revises: e1f2a3b4c5d6
Create Date: 2026-07-28 12:57:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'f2a3b4c5d6e7'
down_revision: Union[str, Sequence[str], None] = 'e1f2a3b4c5d6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'sales_order_items',
        sa.Column('is_resale', sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column(
        'sales_order_items',
        sa.Column('resale_sku', sa.String(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column('sales_order_items', 'resale_sku')
    op.drop_column('sales_order_items', 'is_resale')
