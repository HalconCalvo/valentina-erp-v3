"""add_overhead_category_to_orders_and_payables

Revision ID: 9168e4aad43e
Revises: 3121f9ff166b
Create Date: 2026-04-28 11:07:08.107069

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import sqlmodel


# revision identifiers, used by Alembic.
revision: str = '9168e4aad43e'
down_revision: Union[str, Sequence[str], None] = '3121f9ff166b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    with op.batch_alter_table('purchase_orders', schema=None) as batch_op:
        batch_op.add_column(sa.Column('overhead_category', sqlmodel.sql.sqltypes.AutoString(), nullable=True))

    op.add_column('accounts_payable',
        sa.Column('overhead_category', sa.String(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table('purchase_orders', schema=None) as batch_op:
        batch_op.drop_column('overhead_category')

    op.drop_column('accounts_payable', 'overhead_category')
