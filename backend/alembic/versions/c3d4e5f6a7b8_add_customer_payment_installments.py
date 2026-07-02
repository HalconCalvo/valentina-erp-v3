"""add_customer_payment_installments

Revision ID: c3d4e5f6a7b8
Revises: b2c3d4e5f6a7
Create Date: 2026-07-02 11:51:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import sqlmodel


# revision identifiers, used by Alembic.
revision: str = 'c3d4e5f6a7b8'
down_revision: Union[str, Sequence[str], None] = 'b2c3d4e5f6a7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'customer_payment_installments',
        sa.Column('id', sa.Integer(), primary_key=True, nullable=False),
        sa.Column('customer_payment_id', sa.Integer(), nullable=False),
        sa.Column('amount', sa.Float(), nullable=False),
        sa.Column('payment_date', sa.DateTime(), nullable=False),
        sa.Column('payment_method', sa.String(), nullable=False),
        sa.Column('reference', sa.String(), nullable=True),
        sa.Column('notes', sa.String(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('created_by_user_id', sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(['customer_payment_id'], ['customer_payments.id']),
    )
    op.create_index(
        op.f('ix_customer_payment_installments_customer_payment_id'),
        'customer_payment_installments', ['customer_payment_id'], unique=False
    )


def downgrade() -> None:
    op.drop_index(
        op.f('ix_customer_payment_installments_customer_payment_id'),
        table_name='customer_payment_installments'
    )
    op.drop_table('customer_payment_installments')
