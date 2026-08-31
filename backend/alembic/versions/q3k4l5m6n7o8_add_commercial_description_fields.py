"""add commercial description fields

Revision ID: q3k4l5m6n7o8
Revises: p2j3k4l5m6n7
Create Date: 2026-08-31

"""
from alembic import op
import sqlalchemy as sa

revision = 'q3k4l5m6n7o8'
down_revision = 'p2j3k4l5m6n7'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        'design_product_versions',
        sa.Column('commercial_description', sa.Text(), nullable=True),
    )
    op.add_column(
        'sales_order_item_instances',
        sa.Column('description_override', sa.Text(), nullable=True),
    )


def downgrade():
    op.drop_column('sales_order_item_instances', 'description_override')
    op.drop_column('design_product_versions', 'commercial_description')
