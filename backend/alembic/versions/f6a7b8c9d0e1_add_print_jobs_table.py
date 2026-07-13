"""add_print_jobs_table

Revision ID: f6a7b8c9d0e1
Revises: e5f6a7b8c9d0
Create Date: 2026-07-13 10:53:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'f6a7b8c9d0e1'
down_revision: Union[str, Sequence[str], None] = 'e5f6a7b8c9d0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'print_jobs',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('instance_id', sa.Integer(), nullable=False),
        sa.Column('bundle_number', sa.Integer(), nullable=False),
        sa.Column('total_bundles', sa.Integer(), nullable=False),
        sa.Column('bundle_type', sa.String(), nullable=False),
        sa.Column('zpl_content', sa.Text(), nullable=False),
        sa.Column('status', sa.String(), nullable=False, server_default='PENDING'),
        sa.Column('is_reprint', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('printed_at', sa.DateTime(), nullable=True),
        sa.Column('created_by_user_id', sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(['instance_id'], ['sales_order_item_instances.id']),
        sa.ForeignKeyConstraint(['created_by_user_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    with op.batch_alter_table('print_jobs', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_print_jobs_instance_id'), ['instance_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_print_jobs_status'), ['status'], unique=False)


def downgrade() -> None:
    with op.batch_alter_table('print_jobs', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_print_jobs_status'))
        batch_op.drop_index(batch_op.f('ix_print_jobs_instance_id'))
    op.drop_table('print_jobs')
