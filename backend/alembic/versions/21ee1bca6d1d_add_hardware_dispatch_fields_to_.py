"""add_hardware_dispatch_fields_to_instances

Revision ID: 21ee1bca6d1d
Revises: 5910cd671a93
Create Date: 2026-04-29 10:14:10.964426

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import sqlmodel


# revision identifiers, used by Alembic.
revision: str = '21ee1bca6d1d'
down_revision: Union[str, Sequence[str], None] = '5910cd671a93'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    with op.batch_alter_table('sales_order_item_instances', schema=None) as batch_op:
        batch_op.add_column(sa.Column('hardware_dispatched', sa.Boolean(), nullable=False, server_default='0'))
        batch_op.add_column(sa.Column('hardware_dispatched_at', sa.DateTime(), nullable=True))
        batch_op.add_column(sa.Column('hardware_dispatched_by_user_id', sa.Integer(), nullable=True))
        if bind.dialect.name == 'postgresql':
            batch_op.create_foreign_key('fk_hw_dispatch_user', 'users', ['hardware_dispatched_by_user_id'], ['id'])


def downgrade() -> None:
    bind = op.get_bind()
    with op.batch_alter_table('sales_order_item_instances', schema=None) as batch_op:
        if bind.dialect.name == 'postgresql':
            batch_op.drop_constraint('fk_hw_dispatch_user', type_='foreignkey')
        batch_op.drop_column('hardware_dispatched_by_user_id')
        batch_op.drop_column('hardware_dispatched_at')
        batch_op.drop_column('hardware_dispatched')
