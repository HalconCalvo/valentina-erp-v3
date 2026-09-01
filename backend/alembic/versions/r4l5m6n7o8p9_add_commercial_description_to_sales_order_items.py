"""add commercial description to sales order items

Revision ID: r4l5m6n7o8p9
Revises: q3k4l5m6n7o8
Create Date: 2026-09-01

"""
from alembic import op
import sqlalchemy as sa

revision = 'r4l5m6n7o8p9'
down_revision = 'q3k4l5m6n7o8'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        'sales_order_items',
        sa.Column('commercial_description', sa.Text(), nullable=True),
    )


def downgrade():
    op.drop_column('sales_order_items', 'commercial_description')
