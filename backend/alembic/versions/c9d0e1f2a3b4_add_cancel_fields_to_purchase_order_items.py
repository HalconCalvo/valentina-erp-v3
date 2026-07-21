"""add_cancel_fields_to_purchase_order_items

Revision ID: c9d0e1f2a3b4
Revises: b8c9d0e1f2a3
Create Date: 2026-07-21 11:10:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'c9d0e1f2a3b4'
down_revision: Union[str, Sequence[str], None] = 'b8c9d0e1f2a3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('purchase_order_items', sa.Column('is_cancelled', sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column('purchase_order_items', sa.Column('cancel_reason', sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column('purchase_order_items', 'cancel_reason')
    op.drop_column('purchase_order_items', 'is_cancelled')
