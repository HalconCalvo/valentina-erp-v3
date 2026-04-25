"""add_petty_cash_tables

Revision ID: 686bdc1e0774
Revises: ff3605386efb
Create Date: 2026-04-25 14:52:25.580026

"""
from typing import Sequence, Union
import sqlalchemy as sa
from alembic import op

revision: str = '686bdc1e0774'
down_revision: Union[str, Sequence[str], None] = 'ff3605386efb'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'petty_cash_fund',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('fund_amount', sa.Float(), nullable=False, server_default='5000'),
        sa.Column('minimum_balance', sa.Float(), nullable=False, server_default='1000'),
        sa.Column('current_balance', sa.Float(), nullable=False, server_default='5000'),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.Column('updated_by_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=True),
    )

    op.create_table(
        'petty_cash_movements',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('movement_type', sa.String(), nullable=False),
        sa.Column('amount', sa.Float(), nullable=False),
        sa.Column('concept', sa.String(), nullable=False),
        sa.Column('category', sa.String(), nullable=True),
        sa.Column('receipt_url', sa.String(), nullable=True),
        sa.Column('movement_date', sa.DateTime(), nullable=True),
        sa.Column('created_by_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('notes', sa.String(), nullable=True),
    )


def downgrade() -> None:
    op.drop_table('petty_cash_movements')
    op.drop_table('petty_cash_fund')
