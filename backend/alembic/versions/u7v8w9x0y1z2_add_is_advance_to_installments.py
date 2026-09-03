"""add is_advance to customer_payment_installments

Revision ID: u7v8w9x0y1z2
Revises: t6n7o8p9q0r1
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = 'u7v8w9x0y1z2'
down_revision: Union[str, Sequence[str], None] = 't6n7o8p9q0r1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'customer_payment_installments',
        sa.Column('is_advance', sa.Boolean(), nullable=False, server_default=sa.false()),
    )


def downgrade() -> None:
    op.drop_column('customer_payment_installments', 'is_advance')
