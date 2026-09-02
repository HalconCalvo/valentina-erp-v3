"""add cancel and bank link fields to customer_payment_installments

Revision ID: t6n7o8p9q0r1
Revises: s5m6n7o8p9q0
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = 't6n7o8p9q0r1'
down_revision: Union[str, Sequence[str], None] = 's5m6n7o8p9q0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'customer_payment_installments',
        sa.Column('is_cancelled', sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column(
        'customer_payment_installments',
        sa.Column('cancel_reason', sa.Text(), nullable=True),
    )
    op.add_column(
        'customer_payment_installments',
        sa.Column('cancelled_at', sa.DateTime(), nullable=True),
    )
    op.add_column(
        'customer_payment_installments',
        sa.Column('bank_transaction_id', sa.Integer(), nullable=True),
    )
    op.create_foreign_key(
        'fk_installments_bank_transaction_id',
        'customer_payment_installments',
        'bank_transactions',
        ['bank_transaction_id'],
        ['id'],
    )


def downgrade() -> None:
    op.drop_constraint(
        'fk_installments_bank_transaction_id',
        'customer_payment_installments',
        type_='foreignkey',
    )
    op.drop_column('customer_payment_installments', 'bank_transaction_id')
    op.drop_column('customer_payment_installments', 'cancelled_at')
    op.drop_column('customer_payment_installments', 'cancel_reason')
    op.drop_column('customer_payment_installments', 'is_cancelled')
