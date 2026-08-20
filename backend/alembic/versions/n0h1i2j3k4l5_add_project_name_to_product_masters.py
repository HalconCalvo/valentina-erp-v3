"""add project_name to design_product_masters

Revision ID: n0h1i2j3k4l5
Revises: m9g0h1i2j3k4
Create Date: 2026-08-20

"""
from alembic import op
import sqlalchemy as sa

revision = 'n0h1i2j3k4l5'
down_revision = 'm9g0h1i2j3k4'
branch_labels = None
depends_on = None

def upgrade():
    op.add_column('design_product_masters',
        sa.Column('project_name', sa.String(), nullable=True)
    )

def downgrade():
    op.drop_column('design_product_masters', 'project_name')
