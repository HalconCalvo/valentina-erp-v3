"""add cancel fields to bank_transactions

Revision ID: p2j3k4l5m6n7
Revises: o1i2j3k4l5m6
Create Date: 2026-08-31

"""
from alembic import op
import sqlalchemy as sa

revision = 'p2j3k4l5m6n7'
down_revision = 'o1i2j3k4l5m6'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        'bank_transactions',
        sa.Column('is_cancelled', sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column(
        'bank_transactions',
        sa.Column('cancel_reason', sa.String(), nullable=True),
    )
    op.add_column(
        'bank_transactions',
        sa.Column('cancelled_at', sa.DateTime(), nullable=True),
    )


def downgrade():
    op.drop_column('bank_transactions', 'cancelled_at')
    op.drop_column('bank_transactions', 'cancel_reason')
    op.drop_column('bank_transactions', 'is_cancelled')
