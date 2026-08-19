"""add purchase_prepayments table

Revision ID: l8f9a0b1c2d3
Revises: k7e8f9a0b1c2
Create Date: 2026-08-19

"""
from alembic import op
import sqlalchemy as sa

revision = 'l8f9a0b1c2d3'
down_revision = 'k7e8f9a0b1c2'
branch_labels = None
depends_on = None

def upgrade():
    op.create_table(
        'purchase_prepayments',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('purchase_order_id', sa.Integer(), sa.ForeignKey('purchase_orders.id'), nullable=False, index=True),
        sa.Column('provider_id', sa.Integer(), sa.ForeignKey('providers.id'), nullable=False),
        sa.Column('amount', sa.Float(), nullable=False),
        sa.Column('payment_date', sa.DateTime(), nullable=False),
        sa.Column('reference', sa.String(), nullable=True),
        sa.Column('bank_account', sa.String(), nullable=True),
        sa.Column('notes', sa.String(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('created_by_user_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=True),
    )

def downgrade():
    op.drop_table('purchase_prepayments')
